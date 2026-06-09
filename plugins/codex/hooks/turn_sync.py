#!/usr/bin/env python3
"""Turn-sync implementation for the Codex plugin (opt-in via MEMSY_TURN_SYNC).

Two modes, driven by argv[1]:
  capture  — invoked from the UserPromptSubmit hook. Stashes the user's prompt
             to a per-session temp file so the Stop hook can pair it with the
             assistant reply.
  sync     — invoked from the Stop hook. Reads the stashed prompt + this turn's
             last_assistant_message and POSTs both to /ingest as a user_message
             and an assistant_message (correct speaker labels — the backend
             extraction decides what becomes a durable memory).

CRITICAL: this script must NEVER write to stdout. Codex parses hook stdout —
plain text on a Stop hook is rejected, and stray output could be read as a
block/continue decision. All diagnostics go to stderr, which the calling .sh
redirects to ~/.memsy/turn-sync.log. The script always exits 0.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys

MAX_CONTENT = 32_000
HTTP_TIMEOUT = 5  # seconds — hooks run synchronously, so keep this short.
STASH_TTL = 6 * 3600  # seconds — a pending prompt older than this is a dead turn


def log(msg: str) -> None:
    sys.stderr.write(f"turn-sync: {msg}\n")


def truthy(v: str | None) -> bool:
    return (v or "").strip().lower() in ("on", "true", "1", "yes", "enabled")


def _codex_mcp_env() -> dict:
    """Best-effort read of [mcp_servers.memsy.env] from ~/.codex/config.toml.

    Codex hands the MCP server a curated env built from that block, while this
    hook sees the login shell's env — a key (or MEMSY_ACTOR_ID / MEMSY_PROFILE /
    MEMSY_BASE_URL) set only in config.toml would otherwise never reach
    turn-sync, splitting what it stores from what memsy_search reads. Treating
    the block as a fallback env source keeps the two surfaces aligned. Returns
    {} when the file or tomllib (Python 3.11+) is unavailable.
    """
    try:
        import tomllib
    except ImportError:
        return {}
    try:
        with open(os.path.expanduser("~/.codex/config.toml"), "rb") as f:
            cfg = tomllib.load(f)
        servers = cfg.get("mcp_servers")
        env = servers.get("memsy", {}).get("env", {}) if isinstance(servers, dict) else {}
        return {k: str(v) for k, v in env.items()} if isinstance(env, dict) else {}
    except Exception:
        return {}


def _env(name: str, mcp_env: dict) -> str:
    """Shell env first (the documented way to set hook flags), then the MCP env block."""
    return (os.environ.get(name) or mcp_env.get(name) or "").strip()


def pending_path(session_id: str) -> str:
    key = hashlib.sha256(session_id.encode()).hexdigest()[:16]
    return os.path.join(os.path.expanduser("~/.memsy"), f".codex-turn-{key}.txt")


def _sweep_stale_stashes() -> None:
    """Drop leftover stash files from turns whose Stop hook never fired.

    Without this, prompt-bearing files would accumulate in ~/.memsy forever
    whenever a session dies between UserPromptSubmit and Stop.
    """
    import glob
    import time

    cutoff = time.time() - STASH_TTL
    for p in glob.glob(os.path.expanduser("~/.memsy/.codex-turn-*.txt")):
        try:
            if os.path.getmtime(p) < cutoff:
                os.remove(p)
        except Exception:
            pass


def main() -> int:
    if not truthy(os.environ.get("MEMSY_TURN_SYNC")):
        return 0
    mode = sys.argv[1] if len(sys.argv) > 1 else ""

    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if not isinstance(payload, dict):
        return 0

    session_id = (payload.get("session_id") or "").strip()
    if not session_id:
        return 0

    if mode == "capture":
        prompt = (payload.get("prompt") or "").strip()
        if prompt:
            path = pending_path(session_id)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            try:
                # 0600 — the stash holds raw prompt text, as sensitive as the key.
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w") as f:
                    f.write(prompt[:MAX_CONTENT])
            except Exception as exc:
                log(f"capture failed: {exc}")
        _sweep_stale_stashes()
        return 0

    if mode != "sync":
        return 0

    # Stop can fire again after a turn is continued; only the first fire
    # (stop_hook_active False) should post, or we duplicate the assistant message.
    if payload.get("stop_hook_active"):
        return 0

    assistant = (payload.get("last_assistant_message") or "").strip()

    # Pair with the user prompt captured at UserPromptSubmit; consume it so a
    # later turn can't reuse a stale prompt.
    user_text = ""
    path = pending_path(session_id)
    try:
        import time

        # A stash older than the TTL belongs to a dead turn (its Stop never
        # fired); don't pair its prompt with this unrelated assistant reply.
        stale = os.path.getmtime(path) < time.time() - STASH_TTL
        with open(path) as f:
            user_text = "" if stale else f.read().strip()
        os.remove(path)
    except Exception:
        pass

    if not assistant and not user_text:
        return 0

    mcp_env = _codex_mcp_env()
    cfg = _load_config()
    profile_name, profile = _resolve_profile(cfg, mcp_env)

    api_key = (
        _env("MEMSY_API_KEY", mcp_env)
        or str(profile.get("api_key") or profile.get("apiKey") or "").strip()
    )
    if not api_key:
        log("no API key in env, ~/.codex/config.toml, or ~/.memsy/config.json — skipping")
        return 0

    base_url = (
        _env("MEMSY_BASE_URL", mcp_env)
        or str(profile.get("base_url") or profile.get("baseUrl") or "").strip()
        or "https://api.memsy.io/v1"
    )
    actor_id = _resolve_actor_id(profile_name, profile, mcp_env)
    role_id = _single_default(profile, "default_role_ids", "defaultRoleIds",
                              "MEMSY_DEFAULT_ROLE_IDS", mcp_env)
    team_id = _single_default(profile, "default_team_ids", "defaultTeamIds",
                              "MEMSY_DEFAULT_TEAM_IDS", mcp_env)

    events = []
    if user_text:
        events.append(_event("user_message", user_text, actor_id, session_id, role_id, team_id))
    if assistant:
        events.append(
            _event("assistant_message", assistant, actor_id, session_id, role_id, team_id)
        )
    if not events:
        return 0

    _post_ingest(base_url, api_key, events)
    return 0


def _event(
    kind: str,
    content: str,
    actor_id: str,
    session_id: str,
    role_id: str | None = None,
    team_id: str | None = None,
) -> dict:
    e = {
        "kind": kind,
        "content": content[:MAX_CONTENT],
        "actor_id": actor_id,
        "session_id": session_id,
    }
    if role_id:
        e["role_id"] = role_id
    if team_id:
        e["team_id"] = team_id
    return e


def _single_default(
    profile: dict, snake: str, camel: str, env_name: str, mcp_env: dict
) -> str | None:
    """Mirror the MCP's ingest auto-tag rule (mcp/src/tools/ingest.ts): attach
    the default role/team only when exactly ONE is configured. Profile values
    win; env fills the gap — same merge order as the MCP's loadConfig."""
    v = profile.get(snake) or profile.get(camel)
    vals = [str(x) for x in v if str(x).strip()] if isinstance(v, list) else None
    if not vals:
        raw = _env(env_name, mcp_env)
        vals = [s.strip() for s in raw.split(",") if s.strip()] if raw else None
    return vals[0] if vals is not None and len(vals) == 1 else None


def _load_config() -> dict:
    # Whole-file precedence, identical to the MCP's findConfigFile: a per-project
    # ./.memsy/config.json is used exclusively when present, else the per-user one.
    # cwd is correct here: Codex runs hooks with the session cwd, and the MCP
    # resolves from process.cwd() — CLAUDE_PROJECT_DIR is a Claude Code variable
    # Codex never sets (an inherited one would point at the wrong project).
    base = os.getcwd()
    for path in (
        os.path.join(base, ".memsy", "config.json"),
        os.path.expanduser("~/.memsy/config.json"),
    ):
        try:
            if os.path.isfile(path):
                with open(path) as f:
                    raw = json.load(f)
                return raw if isinstance(raw, dict) else {}
        except Exception:
            return {}
    return {}


def _resolve_profile(cfg: dict, mcp_env: dict) -> tuple[str, dict]:
    profs = cfg.get("profiles") if isinstance(cfg.get("profiles"), dict) else None
    if profs is None and (cfg.get("api_key") or cfg.get("apiKey")):
        profs = {"default": cfg}  # legacy flat config
    active = (
        _env("MEMSY_PROFILE", mcp_env)
        or (cfg.get("active_profile") if isinstance(cfg.get("active_profile"), str) else "")
        or "default"
    )
    prof = profs.get(active) if isinstance(profs, dict) else None
    return active, (prof if isinstance(prof, dict) else {})


def _git_email() -> str:
    for scope in (["--global"], []):
        try:
            out = subprocess.run(
                ["git", "config", *scope, "--get", "user.email"],
                capture_output=True, text=True, timeout=1.5,  # matches mcp/src/identity.ts (1500ms)
            )
            v = out.stdout.strip()
            if v:
                return v
        except Exception:
            pass
    return ""


def _hash_id(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def _resolve_actor_id(profile_name: str, profile: dict, mcp_env: dict) -> str:
    # Mirrors mcp/src/identity.ts resolveActorId so turn-synced events land
    # under the same actor_id that memsy_search reads.
    actor_id = _env("MEMSY_ACTOR_ID", mcp_env)
    if actor_id:
        return actor_id
    pinned = str(profile.get("actor_id") or profile.get("actorId") or "").strip()
    if pinned:
        return pinned
    email = _git_email()
    if email:
        return _hash_id(profile_name, email)
    import getpass
    import socket
    return _hash_id(profile_name, f"{getpass.getuser()}@{socket.gethostname()}")


def _post_ingest(base_url: str, api_key: str, events: list[dict]) -> None:
    import urllib.error
    import urllib.request

    body = json.dumps({"events": events}).encode()
    req = urllib.request.Request(
        base_url.rstrip("/") + "/ingest",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            log(f"ok {resp.status} events={len(events)}")
    except urllib.error.HTTPError as exc:
        detail = b""
        try:
            detail = exc.read()[:200]
        except Exception:
            pass
        log(f"HTTP {exc.code} {detail!r}")
    except Exception as exc:
        log(f"error {exc}")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # never let the hook fail the turn
        log(f"fatal {exc}")
        sys.exit(0)
