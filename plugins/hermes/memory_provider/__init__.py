"""Memsy memory provider for Hermes Agent.

Integrates Memsy as Hermes's native memory backend:
  - prefetch()    called before every LLM call — injects relevant memories as context
  - sync_turn()   called after every turn — persists conversation to Memsy (non-blocking)
  - get_tool_schemas() / handle_tool_call() — exposes memsy_search / memsy_ingest / etc.
    as native Hermes tools (no MCP layer needed)

This is a companion to the general plugin (memsy_hermes_plugin). They can coexist:
  - General plugin: MCP tools + skill triggers + pre_llm_call auto-context hook
  - Memory provider: automatic turn sync + prefetch context injection + native tools

Only one external memory provider can be active at a time. To activate:
  hermes plugins  (interactive toggle)
  # or in ~/.hermes/config.yaml:
  # memory:
  #   provider: memsy
"""

from __future__ import annotations

import json
import logging
import os
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from agent.memory_provider import MemoryProvider

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://api.memsy.io/v1"


class MemsyMemoryProvider(MemoryProvider):
    @property
    def name(self) -> str:
        return "memsy"

    def is_available(self) -> bool:
        return bool(os.environ.get("MEMSY_API_KEY"))

    def initialize(self, session_id: str, **kwargs: Any) -> None:
        self._session_id = session_id
        self._api_key = os.environ.get("MEMSY_API_KEY", "")
        self._base_url = os.environ.get("MEMSY_BASE_URL", _DEFAULT_BASE_URL)
        self._sync_thread: threading.Thread | None = None

        # Merge config file values (non-secret fields saved by save_config)
        hermes_home = kwargs.get("hermes_home", "")
        if hermes_home:
            config_path = Path(hermes_home) / "memsy.json"
            if config_path.exists():
                try:
                    cfg = json.loads(config_path.read_text())
                    if not self._api_key:
                        self._api_key = cfg.get("api_key", "")
                    if self._base_url == _DEFAULT_BASE_URL:
                        self._base_url = cfg.get("base_url", self._base_url)
                except Exception:
                    pass

    def get_config_schema(self) -> list[dict]:
        return [
            {
                "key": "api_key",
                "description": "Memsy API key",
                "secret": True,
                "required": True,
                "env_var": "MEMSY_API_KEY",
                "url": "https://app.memsy.io",
            },
            {
                "key": "base_url",
                "description": "Memsy API base URL (leave as default for cloud)",
                "default": _DEFAULT_BASE_URL,
            },
        ]

    def save_config(self, values: dict, hermes_home: str) -> None:
        config_path = Path(hermes_home) / "memsy.json"
        config_path.write_text(json.dumps(values, indent=2))

    # ── Tools ─────────────────────────────────────────────────────────────────

    def get_tool_schemas(self) -> list[dict]:
        return [
            {
                "name": "memsy_search",
                "description": (
                    "Search Memsy long-term memory for past decisions, preferences, "
                    "and context across all sessions and agents."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "What to search for"},
                        "limit": {
                            "type": "integer",
                            "description": "Number of results (default 8, max 100)",
                            "default": 8,
                        },
                        "threshold": {
                            "type": "number",
                            "description": "Minimum similarity score 0–1 (default 0.0)",
                            "default": 0.0,
                        },
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "memsy_ingest",
                "description": "Store a memory in Memsy. Use when the user explicitly asks to remember something.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {"type": "string", "description": "Memory content to store"},
                        "kind": {
                            "type": "string",
                            "enum": ["user_message", "assistant_message", "app_event"],
                            "description": "Event kind (default: user_message)",
                            "default": "user_message",
                        },
                    },
                    "required": ["content"],
                },
            },
            {
                "name": "memsy_health",
                "description": "Check Memsy service health. Call this when other Memsy tools error.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "memsy_list_memories",
                "description": "Browse stored memories without a query. Use when memsy_search returns nothing.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 20},
                        "sort": {"type": "string", "default": "observed_at_desc"},
                    },
                },
            },
        ]

    def handle_tool_call(self, tool_name: str, args: dict, **kwargs: Any) -> str:
        try:
            if tool_name == "memsy_search":
                body: dict = {"query": args["query"], "limit": args.get("limit", 8)}
                if "threshold" in args:
                    body["threshold"] = args["threshold"]
                return self._post("/search", body)
            elif tool_name == "memsy_ingest":
                event = {
                    "kind": args.get("kind", "user_message"),
                    "content": args["content"],
                }
                return self._post("/ingest", {"events": [event]})
            elif tool_name == "memsy_health":
                return self._get("/health")
            elif tool_name == "memsy_list_memories":
                qs = f"?limit={args.get('limit', 20)}&sort={args.get('sort', 'observed_at_desc')}"
                return self._get(f"/console/memories{qs}")
            else:
                return json.dumps({"error": f"Unknown Memsy tool: {tool_name}"})
        except Exception as exc:
            logger.warning("Memsy tool %s failed: %s", tool_name, exc)
            return json.dumps({"error": str(exc)})

    # ── Memory hooks ──────────────────────────────────────────────────────────

    def system_prompt_block(self) -> str:
        return (
            "Memsy long-term memory is active. "
            "Use memsy_search to recall past decisions, preferences, and cross-session context. "
            "Use memsy_ingest to persist anything the user wants remembered long-term."
        )

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Called before each LLM call. Returns relevant memories as context string."""
        if not self._api_key or not query.strip():
            return ""
        try:
            data = json.loads(self._post("/search", {"query": query, "limit": 5, "threshold": 0.3}))
            memories = data.get("memories", [])
            if not memories:
                return ""
            lines = []
            for m in memories:
                text = (m.get("text") or m.get("content") or "")[:200]
                if text:
                    lines.append(f"- {text}")
            return ("Relevant Memsy memories:\n" + "\n".join(lines)) if lines else ""
        except Exception as exc:
            logger.debug("Memsy prefetch failed: %s", exc)
            return ""

    def sync_turn(
        self,
        user_content: str,
        assistant_content: str,
        *,
        session_id: str = "",
        messages: list | None = None,
    ) -> None:
        """Called after every completed turn. Persists the exchange in a background thread."""
        def _sync() -> None:
            try:
                events = [
                    {"kind": "user_message", "content": user_content[:32000]},
                    {"kind": "assistant_message", "content": assistant_content[:32000]},
                ]
                self._post("/ingest", {"events": events})
            except Exception as exc:
                logger.debug("Memsy sync_turn failed: %s", exc)

        if self._sync_thread and self._sync_thread.is_alive():
            self._sync_thread.join(timeout=5.0)
        self._sync_thread = threading.Thread(target=_sync, daemon=True)
        self._sync_thread.start()

    def on_session_end(self, messages: list) -> None:
        if self._sync_thread and self._sync_thread.is_alive():
            self._sync_thread.join(timeout=10.0)

    def shutdown(self) -> None:
        if self._sync_thread and self._sync_thread.is_alive():
            self._sync_thread.join(timeout=5.0)

    # ── HTTP ──────────────────────────────────────────────────────────────────

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    def _post(self, path: str, body: dict) -> str:
        req = urllib.request.Request(
            f"{self._base_url}{path}",
            data=json.dumps(body).encode(),
            headers=self._headers(),
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read().decode()

    def _get(self, path: str) -> str:
        req = urllib.request.Request(
            f"{self._base_url}{path}",
            headers=self._headers(),
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read().decode()


def register(ctx) -> None:
    ctx.register_memory_provider(MemsyMemoryProvider())
