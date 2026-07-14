"""Groq completion helper."""
from __future__ import annotations

import logging
from typing import List, Dict, Optional, Tuple

import requests

import config

logger = logging.getLogger(__name__)


def _call_ollama_direct(messages: List[Dict[str, str]]) -> str:
    """
    Call Ollama API directly - OLLAMA-ONLY MODE.
    No fallbacks, no demo responses.
    
    Args:
        messages: List of message dicts (role, content)
        
    Returns:
        Response text from Ollama
        
    Raises:
        RuntimeError: If Ollama is not reachable or returns error
    """
    if not config.OLLAMA_ENABLED:
        raise RuntimeError(
            "❌ OLLAMA NOT ENABLED\n"
            "Set OLLAMA_ENABLED=True in backend/.env\n"
            "And ensure Ollama is running: ollama run mistral"
        )
    
    ollama_url = config.OLLAMA_API_URL.rstrip('/')
    endpoint = f"{ollama_url}/api/generate"
    
    # Convert messages to prompt format for Ollama
    prompt = ""
    for msg in messages:
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        if role == 'system':
            prompt += f"System: {content}\n"
        elif role == 'assistant':
            prompt += f"Assistant: {content}\n"
        else:
            prompt += f"User: {content}\n"
    
    payload = {
        "model": config.OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "temperature": 0.7,
    }
    
    logger.info(f"🚀 Calling Ollama at {endpoint}")
    logger.info(f"   Model: {config.OLLAMA_MODEL}")
    logger.info(f"   Prompt length: {len(prompt)} chars")
    
    try:
        response = requests.post(
            endpoint,
            json=payload,
            timeout=config.OLLAMA_TIMEOUT
        )
        response.raise_for_status()
        data = response.json()
        result = data.get("response", "").strip()
        
        logger.info(f"✅ Ollama response received: {len(result)} chars")
        return result
        
    except requests.exceptions.Timeout:
        raise RuntimeError(
            f"❌ OLLAMA TIMEOUT\n"
            f"Ollama at {ollama_url} did not respond within {config.OLLAMA_TIMEOUT}s\n"
            f"Ensure Ollama is running: ollama run mistral"
        )
    except requests.exceptions.ConnectionError:
        raise RuntimeError(
            f"❌ OLLAMA NOT REACHABLE\n"
            f"Cannot connect to Ollama at {ollama_url}\n"
            f"1. Start Ollama: ollama run mistral\n"
            f"2. Verify URL in backend/.env: OLLAMA_API_URL={config.OLLAMA_API_URL}\n"
            f"3. Check firewall/network"
        )
    except requests.exceptions.RequestException as e:
        raise RuntimeError(
            f"❌ OLLAMA REQUEST FAILED\n"
            f"Error: {str(e)}\n"
            f"URL: {endpoint}\n"
            f"Model: {config.OLLAMA_MODEL}"
        )
    except Exception as e:
        raise RuntimeError(
            f"❌ OLLAMA ERROR\n"
            f"Unexpected error: {str(e)}"
        )


def _call_deepseek_local(messages: List[Dict[str, str]]) -> str:
    """
    Route inference to the local DeepSeek-R1-Distill-Qwen-1.5B model.

    Delegates entirely to services.model_service which manages the singleton
    HuggingFace model instance.  This function is intentionally thin so that
    all model-specific logic stays in model_service.py.

    Args:
        messages: OpenAI-style chat message list (role/content dicts).

    Returns:
        Generated response string (chain-of-thought blocks already stripped).

    Raises:
        RuntimeError: Propagated from model_service if the model failed to
                      load or inference threw an exception.
    """
    logger.info("🤖 DeepSeek local provider selected — routing to model_service")
    try:
        from services.model_service import get_model_service
        service = get_model_service()
        return service.generate_response(messages)
    except RuntimeError:
        raise   # Already formatted with a clear error message — re-raise as-is
    except Exception as exc:
        raise RuntimeError(f"❌ DeepSeek local inference failed: {exc}") from exc


def _normalize_key(model_key: str) -> str:
    return (model_key or "").strip().lower()


def _parse_model_key(model_key: Optional[str]) -> Tuple[str, str]:
    key = (model_key or "").strip()
    if not key:
        return "groq", config.GROQ_MODEL

    normalized = _normalize_key(key)
    registry = config.MODEL_REGISTRY
    if normalized in registry:
        item = registry[normalized]
        return item.get("provider", "groq"), item.get("model", config.GROQ_MODEL)

    if ":" in key:
        provider, model_name = key.split(":", 1)
        provider = provider.strip().lower() or "groq"
        model_name = model_name.strip() or config.GROQ_MODEL
        return provider, model_name

    return "groq", key


def _resolve_request_config(model_key: Optional[str]) -> Dict[str, object]:
    provider, model_name = _parse_model_key(model_key)

    if provider == "ollama":
        return {
            "provider": "ollama",
            "model": model_name,
            "endpoint": f"{config.OLLAMA_API_URL.rstrip('/')}/v1/chat/completions",
            "api_key": "",
            "timeout": config.OLLAMA_TIMEOUT,
            "requires_api_key": False,
            "model_key": f"ollama:{model_name}",
        }

    if provider == "openai":
        return {
            "provider": "openai",
            "model": model_name,
            "endpoint": "https://api.openai.com/v1/chat/completions",
            "api_key": config.OPENAI_API_KEY,
            "timeout": config.OPENAI_TIMEOUT,
            "requires_api_key": True,
            "model_key": f"openai:{model_name}",
        }

    # Default provider: groq
    return {
        "provider": "groq",
        "model": model_name,
        "endpoint": f"{config.GROQ_BASE_URL.rstrip('/')}/chat/completions",
        "api_key": config.GROQ_API_KEY,
        "timeout": config.GROQ_TIMEOUT,
        "requires_api_key": True,
        "model_key": f"groq:{model_name}",
    }


def _request_completion(messages: List[Dict[str, str]], model_key: Optional[str]) -> str:
    request_cfg = _resolve_request_config(model_key)
    
    import sys
    sys.stderr.write(f"🔴 GROQ_CALL: {len(messages)} messages, system={messages[0]['content'][:80] if messages else 'NONE'}\n")
    sys.stderr.flush()

    if request_cfg["provider"] == "ollama" and not config.OLLAMA_ENABLED:
        raise RuntimeError("Ollama provider is disabled")

    if request_cfg["requires_api_key"] and not request_cfg["api_key"]:
        provider_name = request_cfg['provider'].upper()
        msg = (
            f"\n❌ {provider_name} API KEY NOT CONFIGURED\n"
            f"Please add to backend/.env:\n"
            f"  {provider_name}_API_KEY=your_key_here\n"
            f"\nGet keys from:\n"
        )
        if request_cfg['provider'] == 'groq':
            msg += "  • https://console.groq.com\n"
        elif request_cfg['provider'] == 'openai':
            msg += "  • https://platform.openai.com/api-keys\n"
        raise RuntimeError(msg)

    payload = {
        "model": request_cfg["model"],
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 1024,
        "top_p": 0.9,
    }
    if request_cfg["provider"] == "ollama":
        payload["think"] = False  # disable thinking mode for qwen3/deepseek-r1 models
    headers = {"Content-Type": "application/json"}
    if request_cfg["api_key"]:
        headers["Authorization"] = f"Bearer {request_cfg['api_key']}"

    response = requests.post(
        request_cfg["endpoint"],
        headers=headers,
        json=payload,
        timeout=request_cfg["timeout"],
    )
    
    # Handle authentication errors specifically
    if response.status_code == 401:
        provider = request_cfg["provider"]
        api_key = request_cfg["api_key"]
        key_preview = api_key[:10] + "..." if api_key else "NOT SET"
        raise RuntimeError(
            f"[401 UNAUTHORIZED] {provider.upper()} API authentication failed. "
            f"API Key: {key_preview}. Please verify your {provider.upper()}_API_KEY in .env is valid."
        )
    
    response.raise_for_status()
    data = response.json()
    return (data["choices"][0]["message"].get("content") or "").strip()


def list_available_models() -> List[Dict[str, object]]:
    """Return model registry metadata for API/UI consumption."""
    models = []
    for model_key, metadata in config.MODEL_REGISTRY.items():
        entry = dict(metadata)
        entry["key"] = model_key
        models.append(entry)
    return sorted(models, key=lambda item: item["key"])


def generate_completion(
    messages: List[Dict[str, str]],
    model_override: Optional[str] = None,
    fallback_models: Optional[List[str]] = None,
    language: str = "en",
    chat_mode: str = "general",
) -> str:
    """Generate completion with model override and fallback chain support.
    
    Args:
        messages: List of message dictionaries with role and content
        model_override: Model to use instead of default
        fallback_models: List of fallback models to try
        language: Language code (en, hi, ta, te, kn, etc.)
        chat_mode: Chat mode (general, explain_concepts, code_assistance, etc.)
        
    Returns:
        Completion string or error message
    """
    
    # =========== OLLAMA-ONLY MODE ===========
    # If LLM_PROVIDER == 'ollama_only', skip all fallback logic
    logger.info("generate_completion() called: LLM_PROVIDER='%s', model_override=%s", config.LLM_PROVIDER, model_override)
    
    if config.LLM_PROVIDER == 'ollama_only':
        logger.info("OLLAMA-ONLY MODE: URL=%s, Model=%s", config.OLLAMA_API_URL, config.OLLAMA_MODEL)
        logger.info("=" * 80)
        logger.info("🚀 OLLAMA-ONLY MODE ACTIVATED")
        logger.info(f"   URL: {config.OLLAMA_API_URL}")
        logger.info(f"   Model: {config.OLLAMA_MODEL}")
        logger.info(f"   No fallbacks - Ollama required")
        logger.info("=" * 80)
        
        try:
            result = _call_ollama_direct(messages)
            return result
        except RuntimeError as e:
            error_msg = str(e)
            logger.error(f"🔴 OLLAMA FAILED: {error_msg}")
            return error_msg
        except Exception as e:
            error_msg = f"❌ OLLAMA ERROR: {str(e)}"
            logger.error(error_msg)
            return error_msg

    # =========== DEEPSEEK LOCAL MODE (HuggingFace Transformers) ===========
    # No API keys, no network calls, no fallbacks — pure local inference.
    # The model singleton is loaded once at startup via services/model_service.py.
    if config.LLM_PROVIDER == 'deepseek_local':
        logger.info("DEEPSEEK LOCAL MODE: model=%s, max_tokens=%d", config.DEEPSEEK_MODEL_NAME, config.DEEPSEEK_MAX_NEW_TOKENS)
        logger.info("=" * 80)
        logger.info("🤖 DEEPSEEK LOCAL MODE")
        logger.info(f"   Model         : {config.DEEPSEEK_MODEL_NAME}")
        logger.info(f"   Max new tokens: {config.DEEPSEEK_MAX_NEW_TOKENS}")
        logger.info(f"   Temperature   : {config.DEEPSEEK_TEMPERATURE}")
        logger.info(f"   Do sample     : {config.DEEPSEEK_DO_SAMPLE}")
        logger.info("=" * 80)

        try:
            result = _call_deepseek_local(messages)
            if not result or not result.strip():
                logger.warning("DeepSeek returned empty result — using fallback message")
                return "I processed your request but couldn't generate a response. Please try rephrasing your message."
            logger.info("DeepSeek local response: %d chars", len(result))
            return result
        except RuntimeError as e:
            error_msg = str(e)
            logger.error("DEEPSEEK LOCAL FAILED: %s", error_msg)
            return f"I encountered an error processing your request: {error_msg}"
        except Exception as e:
            error_msg = f"DEEPSEEK ERROR: {str(e)}"
            logger.error(error_msg)
            return "Something went wrong during local inference. Please try again."


    # =========== STANDARD MODE (with fallbacks) ===========
    # ollama_only is handled by model key routing via /v1/chat/completions
    import sys
    
    # Log API key configuration at START
    logger.info("=" * 80)
    logger.info("🔍 API KEY CONFIGURATION CHECK:")
    logger.info(f"  ✓ GROQ_API_KEY: {'SET' if config.GROQ_API_KEY else '❌ NOT SET'}")
    logger.info(f"  ✓ OPENAI_API_KEY: {'SET' if config.OPENAI_API_KEY else '❌ NOT SET'}")
    logger.info(f"  ✓ OLLAMA_ENABLED: {config.OLLAMA_ENABLED}")
    logger.info(f"  ✓ DEVELOPMENT_MODE: {config.DEVELOPMENT_MODE}")
    logger.info(f"  ✓ DEFAULT_MODEL_KEY: {config.DEFAULT_MODEL_KEY}")
    logger.info(f"  ✓ DEFAULT_MODEL_FALLBACKS: {config.DEFAULT_MODEL_FALLBACKS}")
    logger.info("=" * 80)
    
    candidates: List[Optional[str]] = []
    if model_override:
        candidates.append(model_override)
    else:
        candidates.append(config.DEFAULT_MODEL_KEY)

    if fallback_models:
        candidates.extend(fallback_models)
    else:
        candidates.extend(config.DEFAULT_MODEL_FALLBACKS)

    deduped: List[Optional[str]] = []
    seen = set()
    for candidate in candidates:
        key = _normalize_key(candidate or "")
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)

    logger.info(f"📋 Trying models in order: {deduped}")
    
    errors = []
    auth_errors = []
    
    for candidate in deduped:
        try:
            logger.info(f"🔴 [LLM] Attempting model: {candidate}")
            result = _request_completion(messages, candidate)
            logger.info(f"✅ [LLM] SUCCESS with {candidate}: {len(result)} chars")
            return result
        except requests.exceptions.Timeout:
            logger.error("Completion timed out for model candidate: %s", candidate)
            errors.append(f"timeout:{candidate}")
        except RuntimeError as exc:
            # Check for auth errors
            if "401" in str(exc):
                logger.error("🔴 AUTHENTICATION ERROR: %s", exc)
                auth_errors.append(str(exc))
            else:
                logger.error("Completion failed for %s: %s", candidate, exc)
            errors.append(f"error:{candidate}")
        except requests.exceptions.RequestException as exc:
            logger.error("Completion request failed for %s: %s", candidate, exc)
            errors.append(f"request_error:{candidate}")
        except Exception as exc:
            logger.error("Completion failed for %s: %s", candidate, exc)
            errors.append(f"error:{candidate}")

    # Emergency provider chain: mirrors image fallback behavior for text.
    emergency_candidates: List[str] = []
    if config.OPENAI_API_KEY:
        emergency_candidates.append(f"openai:{config.OPENAI_MODEL}")
    if config.OLLAMA_ENABLED:
        emergency_candidates.append(f"ollama:{config.OLLAMA_MODEL}")
    if config.GROQ_API_KEY:
        emergency_candidates.append(f"groq:{config.GROQ_MODEL}")

    for candidate in emergency_candidates:
        key = _normalize_key(candidate)
        if key in seen:
            continue
        seen.add(key)
        try:
            logger.warning("Trying emergency fallback text model: %s", candidate)
            return _request_completion(messages, candidate)
        except RuntimeError as exc:
            if "401" in str(exc):
                logger.error("🔴 AUTHENTICATION ERROR in fallback: %s", exc)
                auth_errors.append(str(exc))
            logger.error("Emergency fallback failed for %s: %s", candidate, exc)
            errors.append(f"emergency_error:{candidate}")
        except Exception as exc:
            logger.error("Emergency fallback failed for %s: %s", candidate, exc)
            errors.append(f"emergency_error:{candidate}")

    if errors:
        logger.error("All model candidates failed: %s", ", ".join(errors))
    
    # Provide more helpful error message if auth errors were detected
    if auth_errors:
        error_msg = (
            "❌ API AUTHENTICATION FAILED\n"
            "Your API credentials are invalid or missing. Causes:\n"
            f"  • Errors: {'; '.join(auth_errors)}\n\n"
            "FIX: Update backend/.env with valid credentials:"
            f"  1. Get Groq key from https://console.groq.com\n"
            "  2. Set GROQ_API_KEY=your_key_here in backend/.env\n"
            "  3. Restart the backend server"
        )
        logger.error(error_msg)
        return error_msg
    
    # All real APIs failed - provide clear error message
    error_msg = (
        "❌ ERROR: No LLM provider available\n"
        f"Failed models: {', '.join(deduped)}\n"
        "Errors encountered:\n"
        + "\n".join(f"  • {e}" for e in errors) + "\n\n"
        "TROUBLESHOOTING:\n"
        "1. Ensure backend/. env has GROQ_API_KEY set\n"
        "2. Verify API key is valid at https://console.groq.com\n"
        "3. Check internet connection\n"
        "4. Verify OLLAMA_API_URL if using local Ollama\n"
        "5. Check backend logs for more details"
    )
    logger.error(error_msg)
    return error_msg
