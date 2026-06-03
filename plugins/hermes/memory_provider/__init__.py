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
        self._org_id = ""  # cached after first control-plane /me lookup

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

        # Read default role_ids / team_ids / actor_id + active profile from the
        # shared Memsy config (~/.memsy/config.json, overridden by a project
        # ./.memsy/config.json) — the same file the MCP and setup-defaults flow
        # write. So defaults set once in any host apply here too. Read-only:
        # Hermes never writes it (managing defaults is the MCP/dashboard's job).
        self._read_shared_defaults()

        # actor_id MUST match what the MCP server derives (mcp/src/identity.ts:
        # resolveActorId), or memories written here land under a different actor
        # than memsy_search reads — and recall silently finds nothing. Precedence:
        # MEMSY_ACTOR_ID env → shared-config profile actor_id →
        # sha256('<profile>|<git-email>') → sha256('<profile>|<user>@<host>').
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
            {
                "name": "memsy_list_roles",
                "description": (
                    "List roles in the active org. Use during onboarding so the user can pick "
                    "which role(s) to set as defaults via memsy_set_defaults."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 100},
                        "offset": {"type": "integer", "default": 0},
                    },
                },
            },
            {
                "name": "memsy_create_role",
                "description": (
                    "Create a role in the active org. Call memsy_list_roles first to avoid "
                    "duplicates. Returns role_id, usable with memsy_set_defaults."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Role name, e.g. 'Software Engineer'.",
                        },
                        "focus": {
                            "type": "string",
                            "description": (
                                "One sentence on what this role's memories emphasize. "
                                "If the user didn't give one, draft a plausible "
                                "focus from the name."
                            ),
                        },
                    },
                    "required": ["name", "focus"],
                },
            },
            {
                "name": "memsy_list_teams",
                "description": (
                    "List teams in the active org. Use during onboarding so the user can pick "
                    "which team(s) to set as defaults via memsy_set_defaults."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 100},
                        "offset": {"type": "integer", "default": 0},
                    },
                },
            },
            {
                "name": "memsy_create_team",
                "description": (
                    "Create a team in the active org. Call memsy_list_teams first to avoid "
                    "duplicates. Returns team_id, usable with memsy_set_defaults."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Team name, e.g. 'Platform'."},
                        "focus": {
                            "type": "string",
                            "description": (
                                "One sentence on what this team's memories emphasize. "
                                "If the user didn't give one, draft a plausible "
                                "focus from the name."
                            ),
                        },
                    },
                    "required": ["name", "focus"],
                },
            },
            {
                "name": "memsy_set_defaults",
                "description": (
                    "Set default role_ids / team_ids / actor_id for this profile, persisted to "
                    "the shared ~/.memsy/config.json. They become search filters + ingest "
                    "attribution here AND in every other Memsy host. Omit a field to leave it "
                    "unchanged; pass [] to clear roles/teams."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "role_ids": {"type": "array", "items": {"type": "string"}},
                        "team_ids": {"type": "array", "items": {"type": "string"}},
                        "actor_id": {"type": "string"},
                    },
                },
            },
        ]

    def handle_tool_call(self, tool_name: str, args: dict, **kwargs: Any) -> str:
        try:
            if tool_name == "memsy_search":
                body = self._search_body(args["query"], args.get("limit", 8), args.get("threshold"))
                return self._post("/search", body)
            elif tool_name == "memsy_ingest":
                event = self._event(args.get("kind", "user_message"), args["content"])
                return self._post("/ingest", {"events": [event]})
            elif tool_name == "memsy_health":
                return self._get("/health")
            elif tool_name == "memsy_list_memories":
                qs = f"?limit={args.get('limit', 20)}&sort={args.get('sort', 'observed_at_desc')}"
                return self._get(f"/console/memories{qs}")
            elif tool_name == "memsy_list_roles":
                org_id = self._resolve_org_id()
                limit, offset = args.get("limit", 100), args.get("offset", 0)
                qs = f"?org_id={org_id}&limit={limit}&offset={offset}"
                return self._get(f"/roles{qs}")
            elif tool_name == "memsy_create_role":
                org_id = self._resolve_org_id()
                return self._post(
                    "/roles",
                    {"org_id": org_id, "name": args["name"], "focus": args["focus"]},
                )
            elif tool_name == "memsy_list_teams":
                org_id = self._resolve_org_id()
                limit, offset = args.get("limit", 100), args.get("offset", 0)
                qs = f"?org_id={org_id}&limit={limit}&offset={offset}"
                return self._get(f"/teams{qs}")
            elif tool_name == "memsy_create_team":
                org_id = self._resolve_org_id()
                return self._post(
                    "/teams",
                    {"org_id": org_id, "name": args["name"], "focus": args["focus"]},
                )
            elif tool_name == "memsy_set_defaults":
                if "role_ids" not in args and "team_ids" not in args and "actor_id" not in args:
                    raise ValueError("Provide at least one of role_ids, team_ids, or actor_id.")
                actor = args.get("actor_id")
                path = self._persist_defaults(
                    role_ids=args.get("role_ids"),
                    team_ids=args.get("team_ids"),
                    actor_id=(actor.strip() or None) if isinstance(actor, str) else None,
                )
                result = {
                    "persisted_to": path,
                    "profile": self._profile_name,
                    "default_role_ids": self._default_role_ids,
                    "default_team_ids": self._default_team_ids,
                    "actor_id": self._actor_id,
                }
                if actor and os.environ.get("MEMSY_ACTOR_ID", "").strip():
                    result["warning"] = (
                        "MEMSY_ACTOR_ID env is set and overrides the persisted actor_id at "
                        "runtime. Unset it for the persisted value to take effect."
                    )
                return json.dumps(result)
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
            data = json.loads(self._post("/search", self._search_body(query, 5, 0.3)))
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
                self._post("/search", self._search_body(query, 5, 0.3))
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
        if self._config_actor_id:
            return self._config_actor_id
        email = self._git_email()
        if email:
            return self._hash_id(self._profile_name, email)
        import getpass
        import socket

        return self._hash_id(self._profile_name, f"{getpass.getuser()}@{socket.gethostname()}")

    def _read_shared_defaults(self) -> None:
        """Populate active-profile name + default role_ids/team_ids/actor_id from
        the shared Memsy config. Read-only. Falls back to MEMSY_DEFAULT_* env and
        a 'default' profile so a fresh user with no config still works."""

        def _load(path: str) -> dict | None:
            try:
                return json.loads(Path(path).read_text())
            except Exception:
                return None

        def _slice(cfg: dict | None) -> dict:
            if not isinstance(cfg, dict):
                return {}
            profs = cfg.get("profiles")
            if isinstance(profs, dict):
                p = profs.get(self._profile_name)
                return p if isinstance(p, dict) else {}
            return cfg  # legacy flat config == the single default profile

        def _list(slc: dict, key_snake: str, key_camel: str) -> list[str]:
            v = slc.get(key_snake) or slc.get(key_camel)
            return [x for x in v if isinstance(x, str) and x] if isinstance(v, list) else []

        def _env_list(name: str) -> list[str]:
            return [x.strip() for x in os.environ.get(name, "").split(",") if x.strip()]

        home = os.path.expanduser("~")
        gcfg = _load(os.path.join(home, ".memsy", "config.json"))
        pcfg = _load(os.path.join(os.getcwd(), ".memsy", "config.json"))

        env_profile = os.environ.get("MEMSY_PROFILE", "").strip()
        file_active = gcfg.get("active_profile") if isinstance(gcfg, dict) else None
        self._profile_name = env_profile or (
            file_active if isinstance(file_active, str) and file_active else "default"
        )

        gslc, pslc = _slice(gcfg), _slice(pcfg)
        self._default_role_ids = (
            _list(pslc, "default_role_ids", "defaultRoleIds")
            or _list(gslc, "default_role_ids", "defaultRoleIds")
            or _env_list("MEMSY_DEFAULT_ROLE_IDS")
        )
        self._default_team_ids = (
            _list(pslc, "default_team_ids", "defaultTeamIds")
            or _list(gslc, "default_team_ids", "defaultTeamIds")
            or _env_list("MEMSY_DEFAULT_TEAM_IDS")
        )
        self._config_actor_id = (
            pslc.get("actor_id")
            or pslc.get("actorId")
            or gslc.get("actor_id")
            or gslc.get("actorId")
            or ""
        )

    def _event(self, kind: str, content: str) -> dict:
        """Build an ingest event with the identity fields /ingest requires, plus
        default role/team attribution when exactly one default is configured
        (mirrors the MCP's single-default semantic — a multi-value default can't
        pick one to attribute)."""
        ev = {
            "kind": kind,
            "content": content,
            "actor_id": self._actor_id,
            "session_id": self._session_id,
        }
        if len(self._default_role_ids) == 1:
            ev["role_id"] = self._default_role_ids[0]
        if len(self._default_team_ids) == 1:
            ev["team_id"] = self._default_team_ids[0]
        return ev

    def _search_body(self, query: str, limit: int, threshold: float | None = None) -> dict:
        """Build a /search body with actor scoping + default role/team filters
        (only when set — never send empty arrays, which change query semantics)."""
        body: dict = {"query": query, "limit": limit, "actor_id": self._actor_id}
        if threshold is not None:
            body["threshold"] = threshold
        if self._default_role_ids:
            body["role_ids"] = self._default_role_ids
        if self._default_team_ids:
            body["team_ids"] = self._default_team_ids
        return body

    # ── Roles / teams management ────────────────────────────────────────────────

    def _resolve_org_id(self) -> str:
        """Roles/teams need an explicit org_id, resolved from the control plane:
        the hot-path base ends in /v1; the control plane is the sibling /api.
        GET /api/me once and cache (org_id is immutable for an API key)."""
        if self._org_id:
            return self._org_id
        base = self._base_url.rstrip("/")
        if not base.endswith("/v1"):
            raise ValueError(
                f'Cannot derive the Memsy control-plane URL from base_url="{self._base_url}" '
                "(it must end in /v1). Needed to look up org_id for roles/teams."
            )
        control_url = base[:-3] + "/api"
        req = urllib.request.Request(f"{control_url}/me", headers=self._headers())
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        org_id = data.get("org_id")
        if not org_id:
            raise ValueError(f"Memsy /me returned no org_id: {data}")
        self._org_id = str(org_id)
        return self._org_id

    def _persist_defaults(
        self,
        role_ids: list | None = None,
        team_ids: list | None = None,
        actor_id: str | None = None,
    ) -> str:
        """Write defaults to the SHARED Memsy config (~/.memsy/config.json) — the
        same file the apply layer reads and the MCP writes — so a choice made here
        applies everywhere. Read-modify-write the active profile; preserve the
        rest. The file holds API keys, so enforce 0600."""
        config_dir = os.path.join(os.path.expanduser("~"), ".memsy")
        path = os.path.join(config_dir, "config.json")
        try:
            cfg = json.loads(Path(path).read_text())
        except Exception:
            cfg = {}
        if not isinstance(cfg, dict):
            cfg = {}

        profiles = cfg.get("profiles")
        if not isinstance(profiles, dict):
            profiles = {}
        prof = profiles.get(self._profile_name)
        if not isinstance(prof, dict):
            prof = {}

        if role_ids is not None:
            prof["default_role_ids"] = role_ids
        if team_ids is not None:
            prof["default_team_ids"] = team_ids
        if actor_id is not None:
            prof["actor_id"] = actor_id
        profiles[self._profile_name] = prof
        cfg["profiles"] = profiles
        if not isinstance(cfg.get("active_profile"), str) or not cfg.get("active_profile"):
            cfg["active_profile"] = self._profile_name

        os.makedirs(config_dir, exist_ok=True)
        Path(path).write_text(json.dumps(cfg, indent=2))
        os.chmod(path, 0o600)

        # Refresh in-memory defaults so subsequent search/ingest use them.
        self._read_shared_defaults()
        self._actor_id = self._resolve_actor_id()
        return path

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
