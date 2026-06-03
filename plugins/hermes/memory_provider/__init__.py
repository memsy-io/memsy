"""Memsy memory provider for Hermes Agent.

Installed to ~/.hermes/plugins/memory/memsy/ — discovered automatically by Hermes.
Activate with: hermes memory setup
Or manually add to ~/.hermes/config.yaml:
  memory:
    provider: memsy

Lifecycle hooks implemented:
  prefetch()         inject relevant memories before each LLM call
  queue_prefetch()   pre-warm cache after each turn
  sync_turn()        persist user+assistant turn to Memsy (non-blocking)
  on_pre_compress()  save insights before Hermes discards context
  on_memory_write()  mirror Hermes built-in memory writes to Memsy
  on_session_end()   wait for pending sync before exit
  shutdown()         cleanup on process exit
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
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
        # session_id is sent on every ingest event (required by /ingest). Hermes
        # always supplies one; fall back defensively so we never POST an empty id.
        self._session_id = session_id or "hermes-session"
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

        # actor_id MUST match what the MCP server derives (mcp/src/identity.ts:
        # resolveActorId), or memories written here land under a different actor
        # than memsy_search reads — and recall silently finds nothing. Precedence:
        # MEMSY_ACTOR_ID env, else sha256('<profile>|<git-email>')[:16] with
        # profile = MEMSY_PROFILE or 'default', else sha256('<profile>|<user>@<host>').
        self._actor_id = self._resolve_actor_id()

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
                "description": (
                    "Store a memory in Memsy. Use when the user explicitly asks "
                    "to remember something."
                ),
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
                "description": (
                    "Check Memsy service health. Call this when other Memsy tools error."
                ),
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "memsy_list_memories",
                "description": (
                    "Browse stored memories without a query. Use when memsy_search returns nothing."
                ),
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
                body: dict = {
                    "query": args["query"],
                    "limit": args.get("limit", 8),
                    "actor_id": self._actor_id,
                }
                if "threshold" in args:
                    body["threshold"] = args["threshold"]
                return self._post("/search", body)
            elif tool_name == "memsy_ingest":
                event = self._event(args.get("kind", "user_message"), args["content"])
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
            data = json.loads(
                self._post(
                    "/search",
                    {"query": query, "limit": 5, "threshold": 0.3, "actor_id": self._actor_id},
                )
            )
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
        """Called after every completed turn. Persists the exchange in a daemon
        thread. The Hermes contract requires this be NON-BLOCKING, so we fire the
        thread and return immediately — we do NOT join the previous sync here (that
        could block the caller for seconds on a slow network). on_session_end and
        shutdown best-effort join the most recent thread to flush before exit."""

        def _sync() -> None:
            try:
                events = [
                    self._event("user_message", user_content[:32000]),
                    self._event("assistant_message", assistant_content[:32000]),
                ]
                self._post("/ingest", {"events": events})
            except Exception as exc:
                logger.debug("Memsy sync_turn failed: %s", exc)

        self._sync_thread = threading.Thread(target=_sync, daemon=True)
        self._sync_thread.start()

    def queue_prefetch(self, query: str) -> None:
        """Pre-warm cache after each turn so the next prefetch() is faster."""
        if not self._api_key or not query.strip():
            return

        def _warm() -> None:
            try:
                self._post(
                    "/search",
                    {"query": query, "limit": 5, "threshold": 0.3, "actor_id": self._actor_id},
                )
            except Exception:
                pass

        t = threading.Thread(target=_warm, daemon=True)
        t.start()

    def on_pre_compress(self, messages: list) -> None:
        """Save a summary of the conversation before Hermes discards context."""
        if not self._api_key or not messages:
            return
        # Extract the last few substantive turns to preserve before compression.
        turns = [
            m for m in messages if isinstance(m, dict) and m.get("role") in ("user", "assistant")
        ]
        if not turns:
            return
        snippet = " | ".join((m.get("content") or "")[:300] for m in turns[-4:] if m.get("content"))
        if len(snippet) < 40:
            return

        def _save() -> None:
            try:
                self._post(
                    "/ingest",
                    {"events": [self._event("app_event", f"[pre-compress] {snippet}")]},
                )
            except Exception:
                pass

        threading.Thread(target=_save, daemon=True).start()

    def on_memory_write(self, action: str, target: str, content: str) -> None:
        """Mirror Hermes built-in memory writes to Memsy."""
        if not self._api_key or not content:
            return
        payload = f"[hermes-memory:{action}:{target}] {content}"

        def _mirror() -> None:
            try:
                self._post("/ingest", {"events": [self._event("app_event", payload)]})
            except Exception:
                pass

        threading.Thread(target=_mirror, daemon=True).start()

    def on_session_end(self, messages: list) -> None:
        if self._sync_thread and self._sync_thread.is_alive():
            self._sync_thread.join(timeout=10.0)

    def shutdown(self) -> None:
        if self._sync_thread and self._sync_thread.is_alive():
            self._sync_thread.join(timeout=5.0)

    # ── Identity ──────────────────────────────────────────────────────────────

    @staticmethod
    def _git_email() -> str:
        for scope in (["--global"], []):
            try:
                out = subprocess.run(
                    ["git", "config", *scope, "--get", "user.email"],
                    capture_output=True,
                    text=True,
                    timeout=2,
                )
                value = out.stdout.strip()
                if value:
                    return value
            except Exception:
                pass
        return ""

    @staticmethod
    def _hash_id(*parts: str) -> str:
        return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]

    def _resolve_actor_id(self) -> str:
        explicit = os.environ.get("MEMSY_ACTOR_ID", "").strip()
        if explicit:
            return explicit
        profile = os.environ.get("MEMSY_PROFILE", "").strip() or "default"
        email = self._git_email()
        if email:
            return self._hash_id(profile, email)
        import getpass
        import socket

        return self._hash_id(profile, f"{getpass.getuser()}@{socket.gethostname()}")

    def _event(self, kind: str, content: str) -> dict:
        """Build an ingest event with the identity fields /ingest requires."""
        return {
            "kind": kind,
            "content": content,
            "actor_id": self._actor_id,
            "session_id": self._session_id,
        }

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
