"""Memsy plugin for Hermes Agent.

Dual-purpose module: loaded by two distinct Hermes subsystems.

General plugin (PluginManager, kind=standalone):
  - pre_llm_call hook: injects recent memories at session start when
    MEMSY_SESSION_AUTOCONTEXT=on (fires once per session, not every turn).
  - on_session_start hook: resets the auto-context flag on new sessions.
  - Bundled skills: memsy-recall, memsy-remember.

Memory provider (plugins/memory discovery, activated via memory.provider: memsy):
  - prefetch(): relevant memories injected before each LLM call.
  - sync_turn(): non-blocking turn sync to Memsy after each turn.
  - Native tools: memsy_search, memsy_ingest, memsy_health, memsy_list_memories.

MCP tools (memsy_search, memsy_ingest, etc.) are also available via the
@memsy-io/mcp server under mcp_servers.memsy in config.yaml when the
memory provider is not active. Both MCP and native tools can coexist.
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
_DEFAULT_LIMIT = 6
_MAX_LIMIT = 20


def _is_truthy(val: str | None) -> bool:
    return str(val or "").lower() in ("on", "true", "1", "yes", "enabled")


def _context_limit() -> int:
    raw = os.environ.get("MEMSY_SESSION_CONTEXT_LIMIT", str(_DEFAULT_LIMIT))
    try:
        n = int(raw)
        return max(1, min(n, _MAX_LIMIT))
    except ValueError:
        return _DEFAULT_LIMIT


# ── Memory provider ────────────────────────────────────────────────────────────

class MemsyMemoryProvider(MemoryProvider):
    """Memsy as Hermes's native memory backend.

    Provides automatic turn sync (sync_turn) and context injection (prefetch)
    without the MCP layer. Exposes memsy_search / memsy_ingest / memsy_health /
    memsy_list_memories as native tools.

    Activated in config.yaml:
        memory:
          provider: memsy
    """

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

    # ── Tools ──────────────────────────────────────────────────────────────────

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

    # ── Memory hooks ───────────────────────────────────────────────────────────

    def system_prompt_block(self) -> str:
        return (
            "Memsy long-term memory is active. "
            "Use memsy_search to recall past decisions, preferences, and cross-session context. "
            "Use memsy_ingest to persist anything the user wants remembered long-term."
        )

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Called before each LLM call; returns relevant memories as context string."""
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
        """Called after every completed turn; persists the exchange in a background thread."""
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

    # ── HTTP ───────────────────────────────────────────────────────────────────

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


# ── Plugin registration ────────────────────────────────────────────────────────

def register(ctx) -> None:
    """Register with whichever Hermes subsystem is loading this module.

    Called by two distinct loaders:
    - PluginManager (PluginContext): loads general plugin features (hooks, skills).
      `kind: standalone` in plugin.yaml prevents auto-detection as `exclusive`.
    - Memory provider loader (_ProviderCollector): captures MemsyMemoryProvider.
      `_ProviderCollector` has no-ops for register_hook but no register_skill,
      so we guard that call with hasattr.
    """
    # ── Bundle skills (PluginContext only) ─────────────────────────────────────
    if hasattr(ctx, "register_skill"):
        skills_dir = Path(__file__).parent / "skills"
        for child in sorted(skills_dir.iterdir()):
            skill_md = child / "SKILL.md"
            if child.is_dir() and skill_md.exists():
                ctx.register_skill(child.name, skill_md)

    # ── Session state ──────────────────────────────────────────────────────────
    _state: dict[str, bool] = {"autocontext_done": False}

    # ── pre_llm_call hook ──────────────────────────────────────────────────────
    def _pre_llm_call(**kwargs) -> dict[str, str] | None:
        if not _is_truthy(os.environ.get("MEMSY_SESSION_AUTOCONTEXT")):
            return None
        if _state["autocontext_done"]:
            return None
        _state["autocontext_done"] = True

        api_key = os.environ.get("MEMSY_API_KEY", "")
        if not api_key:
            return None

        base_url = os.environ.get("MEMSY_BASE_URL", _DEFAULT_BASE_URL)
        limit = _context_limit()

        try:
            url = f"{base_url}/memories?limit={limit}&sort=observed_at_desc"
            req = urllib.request.Request(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data: dict = json.loads(resp.read())

            memories: list[dict] = data.get("memories", [])
            if not memories:
                return None

            lines: list[str] = []
            for i, m in enumerate(memories[:limit], 1):
                text = (m.get("text") or m.get("content") or "")[:200]
                date = m.get("observed_at", "")
                suffix = f" — {date}" if date else ""
                lines.append(f"{i}. {text}{suffix}")

            block = "\n".join(lines)
            return {"context": f"[Memsy recall (top {len(memories)})]\n{block}"}

        except (urllib.error.URLError, OSError, ValueError):
            return None

    ctx.register_hook("pre_llm_call", _pre_llm_call)

    # ── on_session_start hook ──────────────────────────────────────────────────
    def _on_session_start(**kwargs) -> None:
        _state["autocontext_done"] = False

    ctx.register_hook("on_session_start", _on_session_start)

    # ── Memory provider ────────────────────────────────────────────────────────
    if hasattr(ctx, "register_memory_provider"):
        ctx.register_memory_provider(MemsyMemoryProvider())
