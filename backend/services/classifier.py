"""Intent classification service relying on Groq."""
from __future__ import annotations

import json
import logging
import re
from typing import Dict, Optional

import config
from services.llm import generate_completion

logger = logging.getLogger(__name__)

_ALLOWED_INTENTS = {"general", "realtime", "news", "tool"}
_CLASSIFIER_PROMPT = (
    "You are an intent classifier for a multilingual enterprise assistant. "
    "Decide if the user request is general, realtime, news, or tool. "
    "Realtime covers questions needing current facts (elections, finance, scores). "
    "News covers headline or industry update requests. "
    "Tool covers arithmetic or calculator-like expressions. "
    "Respond ONLY with JSON like {\"intent\": \"general\", \"confidence\": 0.82, \"reason\": \"...\"}."
)

_FALLBACK_KEYWORDS = {
    "tool": ["calculate", "times", "multiply", "divided", "sum", "product"],
    "news": ["news", "headlines", "latest", "update", "breaking", "press release"],
    "realtime": ["current", "today", "now", "right now", "cm of", "price", "score", "live", "won"],
}

_MATH_SYMBOL_PATTERN = re.compile(r"[+\-*/=]")
_MATH_EXPRESSION_PATTERN = re.compile(r"\d+\s*([+\-*/]\s*\d+)+")
_FAST_GENERAL_PATTERN = re.compile(r"^[a-zA-Z0-9\s,.!?'-]{1,40}$")

def classify_query(query: str, model_override: Optional[str] = None) -> Dict[str, object]:
    """Return the detected intent for a user query."""
    cleaned = (query or "").strip()
    if not cleaned:
        return {"intent": "general", "confidence": 0.0}

    # Fast-path heuristics to avoid an extra LLM call for obvious intents.
    heuristic_intent = _fallback_intent(cleaned)
    if heuristic_intent != "general":
        return {"intent": heuristic_intent, "confidence": 0.92}

    # Short/simple chat input is usually general and does not need model classification.
    lowered = cleaned.lower()
    if _FAST_GENERAL_PATTERN.match(cleaned) and len(cleaned) <= 24 and not any(
        k in lowered for k in ["latest", "news", "today", "current", "live", "price", "score"]
    ):
        return {"intent": "general", "confidence": 0.70}

    messages = [
        {"role": "system", "content": _CLASSIFIER_PROMPT},
        {"role": "user", "content": cleaned},
    ]

    try:
        selected_model = model_override or config.CLASSIFIER_MODEL_KEY
        content = generate_completion(
            messages,
            model_override=selected_model,
            fallback_models=config.CLASSIFIER_FALLBACKS,
        )
        parsed = _parse_classifier_json(content)
        intent = parsed.get("intent", "general").lower()
        confidence = float(parsed.get("confidence", 0.0))
        if intent not in _ALLOWED_INTENTS:
            intent = _fallback_intent(cleaned)
        # Guardrail: do not classify as tool unless it really looks arithmetic.
        if intent == "tool" and not _looks_like_math_query(cleaned):
            intent = "general"
        return {"intent": intent, "confidence": confidence}
    except Exception as exc:
        logger.error("Intent classification failed: %s", exc)
        fallback = _fallback_intent(cleaned)
        return {"intent": fallback, "confidence": 0.0}


def _parse_classifier_json(content: str) -> Dict[str, object]:
    snippet = content.strip()
    if snippet.startswith("```"):
        snippet = snippet.split("\n", 1)[1]
        snippet = snippet.rsplit("```", 1)[0]
    try:
        return json.loads(snippet)
    except json.JSONDecodeError:
        return {}


def _contains_keyword(lowered: str, keyword: str) -> bool:
    """Match keyword as a whole word/phrase, not a bare substring.

    Plain `keyword in lowered` false-positives on e.g. "know" containing
    "now", or "wonder" containing "won" - misrouting ordinary chat into
    the realtime/news intent paths.
    """
    return re.search(r"(?<!\w)" + re.escape(keyword) + r"(?!\w)", lowered) is not None


def _fallback_intent(query: str) -> str:
    lowered = query.lower()
    if _looks_like_math_query(lowered):
        return "tool"
    if any(_contains_keyword(lowered, keyword) for keyword in _FALLBACK_KEYWORDS["tool"]):
        return "tool"
    if any(_contains_keyword(lowered, keyword) for keyword in _FALLBACK_KEYWORDS["news"]):
        return "news"
    if any(_contains_keyword(lowered, keyword) for keyword in _FALLBACK_KEYWORDS["realtime"]):
        return "realtime"
    return "general"


def _looks_like_math_query(text: str) -> bool:
    """Return True only for calculator-like inputs, not generic alphanumeric tokens."""
    normalized = (text or "").strip().lower()
    if not normalized:
        return False

    if _MATH_EXPRESSION_PATTERN.search(normalized):
        return True

    has_symbol = bool(_MATH_SYMBOL_PATTERN.search(normalized))
    has_digit = any(ch.isdigit() for ch in normalized)
    if has_symbol and has_digit:
        return True

    math_phrases = ["calculate", "sum of", "difference", "product", "divide", "multiply"]
    return any(phrase in normalized for phrase in math_phrases)
