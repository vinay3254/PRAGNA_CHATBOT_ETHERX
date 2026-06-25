"""
DeepSeek-R1-Distill-Qwen-1.5B Local Model Service
===================================================

Singleton HuggingFace Transformers inference engine.

Design goals
------------
* **CPU-first**: Works out-of-the-box on any x86-64 machine with ≥8 GB RAM.
  Tested baseline: Intel i7-1065G7, 16 GB RAM, no discrete GPU.

* **Zero-code GPU upgrade**: When an NVIDIA GPU is detected (torch.cuda.is_available()),
  the service automatically switches to float16 and device_map="auto".
  No config changes, no code changes required.

* **Singleton + thread-safe lazy init**: The model is loaded exactly once across
  the entire Flask process lifetime.  All subsequent requests reuse the already-
  loaded model and tokenizer without any reload overhead.

* **Response cleaning**: DeepSeek-R1 models emit <think>…</think> chain-of-thought
  blocks before their final answer.  These are stripped so callers receive clean text.

Public API
----------
    from services.model_service import get_model_service, preload_model

    # At app startup (optional eager load)
    preload_model()

    # In generate_completion()
    service = get_model_service()
    text = service.generate_response(messages)   # messages = OpenAI chat format
"""

from __future__ import annotations

import logging
import re
import threading
import time
from typing import Dict, List, Optional

import config

logger = logging.getLogger(__name__)

# ─── Module-level singleton state ─────────────────────────────────────────────
_model = None
_tokenizer = None
_device = None          # torch.device set during _load_model()
_dtype = None           # torch dtype set during _load_model()
_lock = threading.Lock()
_loaded: bool = False
_load_error: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _clean_deepseek_output(text: str) -> str:
    """
    Strip DeepSeek-R1 chain-of-thought reasoning blocks.

    The model wraps internal reasoning in <think>…</think> tags placed before
    the final human-readable answer.  We remove those blocks so callers only
    receive the actual response.

    Handles:
    - Complete blocks: <think>…</think>
    - Unclosed opening tags (partial generation): <think>…
    - Stray closing tags: </think>
    """
    # Remove complete <think>…</think> blocks (multiline-safe)
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    # Remove any remaining unclosed <think> block (everything after it)
    cleaned = re.sub(r"<think>.*$", "", cleaned, flags=re.DOTALL)
    # Remove stray closing tags
    cleaned = re.sub(r"</think>", "", cleaned)
    return cleaned.strip()


def _build_prompt(tokenizer, messages: List[Dict[str, str]]) -> str:
    """
    Convert OpenAI-style message list → model-ready prompt string.

    Uses the tokenizer's built-in ``apply_chat_template()`` when available
    (correct for Qwen-based models).  Falls back to a safe manual format
    if the tokenizer has no chat template.

    Args:
        tokenizer: Loaded HuggingFace tokenizer.
        messages:  List of ``{"role": ..., "content": ...}`` dicts.

    Returns:
        A single string ready to tokenize and feed to the model.
    """
    try:
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
    except Exception as exc:
        logger.warning("apply_chat_template failed (%s); using fallback format", exc)
        parts: List[str] = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                parts.append(f"System: {content}")
            elif role == "assistant":
                parts.append(f"Assistant: {content}")
            else:
                parts.append(f"User: {content}")
        parts.append("Assistant:")
        return "\n\n".join(parts)


# ─── Core loader ──────────────────────────────────────────────────────────────

def _load_model() -> None:
    """
    Load the DeepSeek-R1-Distill-Qwen-1.5B model from HuggingFace Hub.

    Thread-safe; called at most once per process.  Sets module-level
    ``_model``, ``_tokenizer``, ``_device``, ``_dtype``, ``_loaded``,
    and ``_load_error``.

    Device strategy
    ---------------
    * CUDA GPU present  → float16, device_map="auto"  (multi-GPU aware via accelerate)
    * CPU only          → float32, explicit .to(cpu)   (stable across all x86-64 CPUs)

    The float32 / no-device_map path is safe on Intel integrated graphics and
    any machine without a CUDA-capable GPU.
    """
    global _model, _tokenizer, _device, _dtype, _loaded, _load_error

    model_name: str = config.DEEPSEEK_MODEL_NAME
    t0 = time.time()

    logger.info("=" * 70)
    logger.info("🚀 DeepSeek Model Service — startup")
    logger.info("   Model : %s", model_name)
    logger.info("=" * 70)

    # ── Import check ──────────────────────────────────────────────────────
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as exc:
        _load_error = (
            f"❌ Missing dependency: {exc}\n"
            "Install with:\n"
            "  pip install transformers torch accelerate sentencepiece safetensors"
        )
        logger.error(_load_error)
        return

    # ── Device & dtype selection ──────────────────────────────────────────
    if torch.cuda.is_available():
        _device = torch.device("cuda")
        _dtype = torch.float16          # fp16 halves VRAM usage on GPU
        device_map: Optional[str] = "auto"  # accelerate handles multi-GPU / CPU-offload
        gpu_name = torch.cuda.get_device_name(0)
        gpu_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
        logger.info("⚡ Device     : CUDA GPU — %s", gpu_name)
        logger.info("   VRAM       : %.1f GB", gpu_gb)
        logger.info("   dtype      : float16")
        logger.info("   device_map : auto")
    else:
        _device = torch.device("cpu")
        _dtype = torch.float32          # fp32 is universally safe on CPU
        device_map = None               # Avoid accelerate overhead on CPU-only machines
        logger.info("🖥️  Device     : CPU  (no CUDA GPU detected)")
        logger.info("   Threads    : %d", torch.get_num_threads())
        logger.info("   dtype      : float32  (CPU-safe)")
        logger.info("   RAM usage  : ~6 GB  (1.5B params × 4 bytes)")
        logger.info("   ⚠️  First inference will be slow (30–120 s on CPU)")

    # ── Tokenizer ─────────────────────────────────────────────────────────
    logger.info("📥 Loading tokenizer…")
    try:
        _tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            trust_remote_code=True,
        )
        logger.info("   Tokenizer loaded — vocab size: %d", len(_tokenizer))
    except Exception as exc:
        _load_error = f"❌ Tokenizer load failed: {exc}"
        logger.error(_load_error, exc_info=True)
        return

    # ── Model weights ─────────────────────────────────────────────────────
    logger.info("📥 Loading model weights (first run downloads ~3 GB, cached afterwards)…")
    logger.info("   Cache dir : ~/.cache/huggingface/hub/")

    try:
        load_kwargs: Dict = {
            "torch_dtype": _dtype,
            # Stream weight shards into RAM one at a time instead of loading
            # the full checkpoint then moving — critical for memory-constrained
            # CPU environments.
            "low_cpu_mem_usage": True,
            "trust_remote_code": True,
        }
        if device_map is not None:
            load_kwargs["device_map"] = device_map

        _model = AutoModelForCausalLM.from_pretrained(model_name, **load_kwargs)

        # On CPU, we handle device placement explicitly (no accelerate dispatcher)
        if device_map is None:
            _model = _model.to(_device)

        # Switch to inference mode: disables dropout, training-only layers
        _model.eval()

    except MemoryError:
        _load_error = (
            "❌ Out of RAM while loading the model.\n"
            "The 1.5B model needs ~6 GB free RAM (float32).\n"
            "Close other applications and restart the backend."
        )
        logger.error(_load_error)
        return
    except Exception as exc:
        _load_error = f"❌ Model load failed: {exc}"
        logger.error(_load_error, exc_info=True)
        return

    elapsed = time.time() - t0
    param_count = sum(p.numel() for p in _model.parameters()) / 1e9

    logger.info("=" * 70)
    logger.info("✅ DeepSeek model loaded successfully")
    logger.info("   Parameters : %.2f B", param_count)
    logger.info("   Device     : %s", _device)
    logger.info("   dtype      : %s", _dtype)
    logger.info("   Load time  : %.1f s", elapsed)
    logger.info("=" * 70)

    _loaded = True


def _ensure_loaded() -> None:
    """Trigger model loading on first call (thread-safe lazy initializer)."""
    if _loaded or _load_error:
        return
    with _lock:
        # Double-checked locking: re-verify after acquiring the lock
        if not _loaded and _load_error is None:
            _load_model()


# ─── Service class ────────────────────────────────────────────────────────────

class DeepSeekModelService:
    """
    Thin wrapper around the module-level singleton model + tokenizer.

    Using a class mirrors the existing service pattern in this codebase
    (e.g. RAGService, CacheService) so callers have a consistent interface:

        service = get_model_service()
        response = service.generate_response(messages)
    """

    def generate_response(self, messages: List[Dict[str, str]]) -> str:
        """
        Run inference on the loaded DeepSeek model.

        Args:
            messages: OpenAI-style chat message list, e.g.::

                [
                    {"role": "system",    "content": "You are Pragna…"},
                    {"role": "user",      "content": "Explain gravity"},
                ]

        Returns:
            Clean assistant response string (chain-of-thought blocks removed).

        Raises:
            RuntimeError: If the model could not be loaded, or inference fails.
        """
        _ensure_loaded()

        if _load_error:
            raise RuntimeError(_load_error)
        if not _loaded:
            raise RuntimeError(
                "❌ DeepSeek model is not loaded. Check backend startup logs."
            )

        import torch

        t0 = time.time()
        logger.info("🔍 DeepSeek inference — %d messages in context", len(messages))

        try:
            # ── Prompt construction ────────────────────────────────────────
            prompt_text = _build_prompt(_tokenizer, messages)
            logger.debug("   Prompt: %d chars", len(prompt_text))

            # ── Tokenise — truncate long inputs to keep CPU memory safe ────
            inputs = _tokenizer(
                prompt_text,
                return_tensors="pt",
                truncation=True,
                max_length=2048,    # Leaves headroom for generated tokens
            ).to(_device)

            input_len: int = inputs["input_ids"].shape[1]
            logger.info("   Input tokens  : %d", input_len)

            # ── Inference ──────────────────────────────────────────────────
            with torch.no_grad():   # Disable gradient tracking → saves memory
                outputs = _model.generate(
                    **inputs,
                    max_new_tokens=config.DEEPSEEK_MAX_NEW_TOKENS,
                    do_sample=config.DEEPSEEK_DO_SAMPLE,
                    temperature=(
                        config.DEEPSEEK_TEMPERATURE
                        if config.DEEPSEEK_DO_SAMPLE
                        else 1.0    # temperature is irrelevant when do_sample=False
                    ),
                    top_p=0.9,
                    top_k=50,
                    repetition_penalty=1.1,     # Reduce looping / repetitive output
                    pad_token_id=_tokenizer.eos_token_id,
                    eos_token_id=_tokenizer.eos_token_id,
                )

            # ── Decode — only the newly generated tokens (skip the prompt) ─
            new_tokens = outputs[0][input_len:]
            raw_text = _tokenizer.decode(new_tokens, skip_special_tokens=True)

            # ── Strip DeepSeek reasoning blocks ────────────────────────────
            cleaned = _clean_deepseek_output(raw_text)

            # ── Handle empty cleaned output ─────────────────────────────────
            # DeepSeek-R1 distill models sometimes produce ONLY a <think> block
            # with no final answer. In that case we extract the last substantive
            # paragraph from the thinking block itself as the response.
            if not cleaned:
                # Try to pull content from inside the <think> block
                think_match = re.search(r"<think>(.*?)</think>", raw_text, re.DOTALL)
                if think_match:
                    think_content = think_match.group(1).strip()
                    # Take the last 2 non-empty paragraphs as the answer
                    paragraphs = [p.strip() for p in think_content.split("\n\n") if p.strip()]
                    cleaned = "\n\n".join(paragraphs[-2:]) if paragraphs else think_content
                    logger.info("Empty output after think-strip; using last %d paragraphs of think block", len(paragraphs[-2:]))
                elif raw_text.strip():
                    cleaned = raw_text.strip()
                    logger.info("Empty cleaned output; falling back to raw_text")
                else:
                    cleaned = "I understand your question. Could you please provide more details so I can give you a more specific answer?"
                    logger.warning("Model generated empty output — using fallback message")

            elapsed = time.time() - t0
            out_len = len(new_tokens)
            tok_per_s = out_len / elapsed if elapsed > 0 else 0.0

            logger.info(
                "DeepSeek response — %d tokens in %.1f s (%.1f tok/s) | %d chars",
                out_len, elapsed, tok_per_s, len(cleaned),
            )

            return cleaned

        except Exception as exc:
            # Surface CUDA OOM with a clear actionable message
            if "out of memory" in str(exc).lower():
                oom_msg = (
                    "❌ Out of memory during inference. "
                    "Reduce DEEPSEEK_MAX_NEW_TOKENS in backend/.env and restart."
                )
                logger.error(oom_msg)
                raise RuntimeError(oom_msg) from exc

            elapsed = time.time() - t0
            logger.error(
                "❌ DeepSeek inference failed after %.1f s: %s", elapsed, exc,
                exc_info=True,
            )
            raise RuntimeError(f"DeepSeek inference error: {exc}") from exc


# ─── Module-level singleton ───────────────────────────────────────────────────

_service_instance: Optional[DeepSeekModelService] = None


def get_model_service() -> DeepSeekModelService:
    """
    Return the module-level DeepSeekModelService singleton.

    Thread-safe.  Triggers model loading on the first call if
    ``preload_model()`` was not called at startup.
    """
    global _service_instance
    if _service_instance is None:
        with _lock:
            if _service_instance is None:
                _service_instance = DeepSeekModelService()
    return _service_instance


def preload_model() -> None:
    """
    Eagerly load the model in the calling thread.

    Call this once at application startup (e.g. at the end of ``app.py``'s
    startup block) so the first chat request does not incur the full model-
    loading latency.

    Safe to call multiple times — subsequent calls are no-ops.
    """
    logger.info("preload_model() called — ensuring model is loaded…")
    _ensure_loaded()
    if _load_error:
        logger.error("⚠️  Model preload failed: %s", _load_error)
    elif _loaded:
        logger.info("✅ Model preload complete — ready for inference")
