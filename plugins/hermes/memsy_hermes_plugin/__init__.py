"""Memsy plugin for Hermes Agent.

Provides:
  - pre_llm_call hook: injects recent memories at the start of each session
    when MEMSY_SESSION_AUTOCONTEXT=on (fires once per session, not every turn).
  - on_session_start hook: resets the auto-context flag for each new session.
  - Bundled skills: memsy-recall, memsy-remember (registered via ctx.register_skill).

MCP tools (memsy_search, memsy_ingest, memsy_health, etc.) are provided by the
@memsy-io/mcp server configured under mcp_servers.memsy in config.yaml — this
plugin adds the lifecycle layer on top.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path


_DEFAULT_BASE_URL = "https://api.memsy.io"
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


def register(ctx) -> None:
    # ── Bundle skills ─────────────────────────────────────────────────────────
    skills_dir = Path(__file__).parent / "skills"
    for child in sorted(skills_dir.iterdir()):
        skill_md = child / "SKILL.md"
        if child.is_dir() and skill_md.exists():
            ctx.register_skill(child.name, skill_md)

    # Track whether auto-context has fired this session.
    # Reset in on_session_start so gateway /new and idle-rotation work correctly.
    _state: dict[str, bool] = {"autocontext_done": False}

    # ── pre_llm_call hook ─────────────────────────────────────────────────────
    # Fires once per turn before the LLM loop. Returns {"context": "..."} to
    # inject text into the user message. Used here to surface recent memories at
    # the start of a session when MEMSY_SESSION_AUTOCONTEXT=on.
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
            # Network failure — silently skip, never block the agent turn.
            return None

    ctx.register_hook("pre_llm_call", _pre_llm_call)

    # ── on_session_start hook ─────────────────────────────────────────────────
    # Reset the auto-context flag whenever a new session starts (gateway /new,
    # /reset, /clear, idle rotation, or a fresh CLI invocation).
    def _on_session_start(**kwargs) -> None:
        _state["autocontext_done"] = False

    ctx.register_hook("on_session_start", _on_session_start)
