"""Central orchestrator for chat, agent actions, and realtime context tasks."""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from services import agent_tools

logger = logging.getLogger(__name__)


class AIOrchestrator:
    """Coordinate routing between agent tools and the existing LLM/RAG path."""

    def __init__(self, llm_service):
        self.llm = llm_service

    def handle_query(
        self,
        message: str,
        language: str = "en",
        user_id: str = "default",
        chat_mode: str = "general",
        model_override: Optional[str] = None,
        fallback_models: Optional[List[str]] = None,
        persona_system_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Process one request and return a unified response envelope."""
        route = self._route_agent_action(message)

        if route == "world_news":
            response = agent_tools.get_world_news()
            return {
                "response": response,
                "route": "agent",
                "action": "world_news",
                "actions": [agent_tools.open_world_monitor()],
                "web_search_sources": [],
                "language": language,
                "chat_mode": chat_mode,
            }

        if route == "world_monitor":
            return {
                "response": "Opening World Monitor for a live global intelligence view.",
                "route": "agent",
                "action": "open_world_monitor",
                "actions": [agent_tools.open_world_monitor()],
                "web_search_sources": [],
                "language": language,
                "chat_mode": chat_mode,
            }

        if route == "time":
            return {
                "response": f"Current server time is {agent_tools.get_current_time()}.",
                "route": "agent",
                "action": "time",
                "actions": [],
                "web_search_sources": [],
                "language": language,
                "chat_mode": chat_mode,
            }

        if route == "system_info":
            info = agent_tools.get_system_info()
            return {
                "response": (
                    "System snapshot: "
                    f"OS={info['os']} {info['os_version']}, "
                    f"Machine={info['machine']}, Python={info['python_version']}."
                ),
                "route": "agent",
                "action": "system_info",
                "actions": [],
                "web_search_sources": [],
                "language": language,
                "chat_mode": chat_mode,
            }

        if route == "model_update_info":
            return {
                "response": (
                    "I do not have direct visibility into internal training cutoffs or private model update timelines. "
                    "I can share the currently configured runtime model and platform health from this deployment instead."
                ),
                "route": "agent",
                "action": "model_update_info",
                "actions": [],
                "web_search_sources": [],
                "language": language,
                "chat_mode": chat_mode,
            }

        wc_input = self._extract_word_count_payload(message)
        if wc_input:
            counts = agent_tools.word_count(wc_input)
            return {
                "response": (
                    "Text metrics: "
                    f"{counts['words']} words, {counts['characters']} characters, "
                    f"{counts['lines']} lines."
                ),
                "route": "agent",
                "action": "word_count",
                "actions": [],
                "web_search_sources": [],
                "language": language,
                "chat_mode": chat_mode,
            }

        # Default: reuse existing classifier/router/planner + RAG flow through LLM service.
        ai_response, sources = self.llm.get_response(
            message,
            language,
            user_id,
            chat_mode,
            model_override=model_override,
            fallback_models=fallback_models,
            persona_system_prompt=persona_system_prompt,
        )
        return {
            "response": ai_response,
            "route": "llm",
            "action": "chat",
            "actions": [],
            "web_search_sources": sources,
            "language": language,
            "chat_mode": chat_mode,
        }

    @staticmethod
    def _route_agent_action(message: str) -> str | None:
        text = (message or "").strip().lower()
        if not text:
            return None

        if any(k in text for k in ["world news", "global news", "brief me", "what did i miss"]):
            return "world_news"

        if any(k in text for k in ["world monitor", "open monitor", "open dashboard"]):
            return "world_monitor"

        if any(k in text for k in ["current time", "time now", "what time"]):
            return "time"

        if any(k in text for k in ["system info", "system information", "device info", "host info"]):
            return "system_info"

        model_update_keywords = [
            "model update",
            "training data",
            "training cutoff",
            "knowledge cutoff",
            "when were you updated",
            "last major update",
            "what version are you trained on",
        ]
        if any(k in text for k in model_update_keywords):
            return "model_update_info"

        if text.startswith("word count") or text.startswith("count words"):
            return "word_count"

        return None

    @staticmethod
    def _extract_word_count_payload(message: str) -> str | None:
        text = (message or "").strip()
        if not text:
            return None

        # Supports: "word count: ...", "word count ...", "count words ..."
        m = re.match(r"^(word\s+count|count\s+words)\s*[:\-]?\s*(.+)$", text, re.IGNORECASE | re.DOTALL)
        if not m:
            return None

        payload = m.group(2).strip()
        return payload or None
