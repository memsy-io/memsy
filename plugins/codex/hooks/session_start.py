#!/usr/bin/env python3
"""session_start.py — Memsy auto-context for Codex's SessionStart hook.

This is invoked by the bash shim session-start.sh. The logic lives in Python on
purpose: the macOS default shell (bash 3.2) has a long-standing parser bug with
heredocs-in-command-substitution, which silently broke the previous all-bash
version of this hook (the script failed to parse, Codex swallowed the non-zero
exit, and every SessionStart-gated feature quietly never fired). python3 is
already a hard dependency of the plugin, so doing the work here removes that
entire class of shell-parser fragility.

OPT-IN: the recall / proactive / confirm behaviours do nothing unless
MEMSY_SESSION_AUTOCONTEXT=on, MEMSY_PROACTIVE=on, or MEMSY_CONFIRM_STORE=on is
set in the environment — all default OFF. The ONE exception is a one-time,
network-free first-run setup nudge (see _onboarding_nudge): on a genuine session
start, if no default roles/teams are configured, it emits a single setup pointer
and writes ~/.memsy/.onboard-nudged so it never repeats.

Codex pipes the hook payload (incl. `source`: startup|resume|clear|compact) on
stdin and requires SessionStart output to be a JSON object of the form
  {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}
Plain text is rejected at runtime, so we build the human-readable text, then
JSON-encode it once at the end.

SessionStart fires on startup, resume, clear AND compact. On `compact` (a mid-
session event) we suppress the nudge and the auto-context block — both are
"first message of the session" instructions that contradict themselves when
re-injected mid-conversation — but still re-assert the mode/proactive blocks,
since a compacted transcript may have dropped them.
"""

from __future__ import annotations

import json
import os
import sys

MARKER = os.path.expanduser("~/.memsy/.onboard-nudged")

NUDGE_TEXT = """[memsy setup — first run]

No default Memsy roles/teams are configured yet (optional — they sharpen recall
and attribution). Tell the user once, in one line, that you can set this up. If
they agree (or say "set up my memsy defaults", or invoke the setup-defaults
prompt): call memsy_list_roles and memsy_list_teams — show what their org
already has, or offer to create some via memsy_create_role / memsy_create_team —
then memsy_set_defaults (persist:"global"). If they decline, drop it; this won't repeat.

"""

PROACTIVE_TEXT = """[memsy proactive mode — MEMSY_PROACTIVE=on]

For the rest of this conversation, actively watch for content the user
clearly wants remembered, EVEN IF they don't say "remember that" or "save
this". When you spot it, store it via memsy_ingest. Categories that qualify:

  - Personal preferences:   "I like X", "my favorite is Y", "I prefer Z"
  - Intents / plans:        "I want to do X", "I plan to Y", "I'm going to Z"
  - Decisions:              "we decided X", "going with Y", "switching to Z"
  - Constraints discovered: "X doesn't work because Y", "we can't do Z"
  - Learnings:              "turns out X", "the trick is Y", "found that Z"

Workflow per save-worthy item:

  1. Pre-flight (same as memsy-remember skill):
     - too short (<20 chars) → skip.
     - secret-shaped token (msy_/sk_/ghp_/Bearer) → skip.
     - already stored this session (same substance) → skip.

  2. If [memsy modes: ... confirm-before-store ...] is ALSO in your context,
     ask before storing:
         Memsy will store: <substance>
         Save? (y / n / edit "<new text>")
     Otherwise store directly — proactive mode is the user pre-authorizing.

  3. Call memsy_ingest with ONE event:
       kind:     match the speaker the substance came FROM —
                 "assistant_message" if it's something you (the assistant)
                 produced or concluded; "user_message" if it's something the
                 user stated. (Do NOT default everything to user_message.)
       content:  the substance (standalone, no framing)
       ts:       current ISO 8601
       metadata: JSON.stringify({source:"codex-proactive",safe_to_delete:true})

  4. Acknowledge AFTER answering what the user asked, one-liner:
       → saved to Memsy: "<first 60 chars>..." (event <id>)

Hard rules:
  - Save things useful 3+ months from now. Ephemeral context is noise.
  - Do NOT ask "do you want me to remember that?" every turn.
  - Do NOT save the user's questions. If the user is ASKING rather than
    ASSERTING, there is nothing to save — skip the turn. Never rephrase a
    question into a pseudo-statement (e.g. "the user is exploring X") just to
    have something to store; that is still saving the question.
  - Only store a genuine assertion (a preference / intent / decision /
    constraint / learning) the user actually stated, or a concrete conclusion
    YOU reached. When in doubt, don't store.

To disable: unset MEMSY_PROACTIVE and restart Codex.

"""

AUTOCONTEXT_TEMPLATE = """[memsy auto-context — MEMSY_SESSION_AUTOCONTEXT=on]

Before processing the user's first message in this session, call the
memsy_list_memories MCP tool with these arguments:

  limit: {limit}
  sort:  "observed_at_desc"

Then surface the results as a single block titled "Memsy recall (top {limit})",
each memory on its own line:

  N. <memory text, truncate to 200 chars> — <observed_at>

Rules:
- If the tool errors or returns 0 memories, output nothing and proceed normally.
- Do not call memsy_list_memories again on subsequent turns for context.
  Later searches should be user-intent-driven (memsy-recall skill).

To disable: unset MEMSY_SESSION_AUTOCONTEXT and restart Codex.
"""


def _truthy(v: str | None) -> bool:
    return (v or "").strip().lower() in ("on", "true", "1", "yes", "enabled")


def _read_source() -> str:
    try:
        payload = json.load(sys.stdin)
        if isinstance(payload, dict):
            return str(payload.get("source") or "startup")
    except Exception:
        pass
    return "startup"


def _load_config() -> dict:
    # Whole-file precedence, identical to turn_sync.py:_load_config and the MCP's
    # findConfigFile: a per-project ./.memsy/config.json is used exclusively when
    # present, else the per-user one. cwd (not CLAUDE_PROJECT_DIR) — Codex runs
    # hooks with the session cwd and never sets that Claude Code variable.
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


def _defaults_configured() -> bool:
    if os.environ.get("MEMSY_DEFAULT_ROLE_IDS") or os.environ.get("MEMSY_DEFAULT_TEAM_IDS"):
        return True
    cfg = _load_config()
    active = (
        os.environ.get("MEMSY_PROFILE")
        or (cfg.get("active_profile") if isinstance(cfg.get("active_profile"), str) else "")
        or "default"
    )
    profs = cfg.get("profiles")
    prof = (profs.get(active) or {}) if isinstance(profs, dict) else cfg
    if not isinstance(prof, dict):
        return False
    roles = prof.get("default_role_ids") or prof.get("defaultRoleIds")
    teams = prof.get("default_team_ids") or prof.get("defaultTeamIds")
    return bool(roles) or bool(teams)


def _onboarding_nudge() -> str:
    """One-time first-run nudge. Returns the nudge text, or '' if already nudged
    or defaults are already configured. Burns the marker only when it emits."""
    if os.path.exists(MARKER):
        return ""
    if _defaults_configured():
        return ""
    try:
        os.makedirs(os.path.dirname(MARKER), exist_ok=True)
        with open(MARKER, "w"):
            pass
    except Exception:
        # If we can't write the marker we'd nag every session — better to stay
        # silent than to repeat. Skip the nudge.
        return ""
    return NUDGE_TEXT


def _clamp_limit() -> int:
    raw = os.environ.get("MEMSY_SESSION_CONTEXT_LIMIT", "6")
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return 6
    return max(1, min(20, n))


def generate_context(source: str) -> str:
    parts: list[str] = []

    # First-run nudge only on a genuine session start — never mid-session compact.
    if source != "compact":
        parts.append(_onboarding_nudge())

    # Mode block — emitted whenever any mode is active. Skills read this line.
    modes = ""
    if _truthy(os.environ.get("MEMSY_CONFIRM_STORE")):
        modes += " confirm-before-store"
    if _truthy(os.environ.get("MEMSY_PROACTIVE")):
        modes += " proactive"
    if modes:
        parts.append("[memsy modes:%s]\n\n" % modes)

    if _truthy(os.environ.get("MEMSY_PROACTIVE")):
        parts.append(PROACTIVE_TEXT)

    # Auto-context recall — only when AUTOCONTEXT is on, and never on `compact`.
    if _truthy(os.environ.get("MEMSY_SESSION_AUTOCONTEXT")) and source != "compact":
        parts.append(AUTOCONTEXT_TEMPLATE.format(limit=_clamp_limit()))

    return "".join(parts)


def main() -> int:
    source = _read_source()
    # rstrip trailing newlines to match the previous all-bash version, whose
    # content="$(...)" command substitution stripped them.
    content = generate_context(source).rstrip("\n")
    # Emit ONLY when there's something to say, wrapped in the JSON envelope Codex
    # requires for SessionStart hooks.
    if content.strip():
        sys.stdout.write(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "SessionStart",
                        "additionalContext": content,
                    }
                }
            )
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Never fail the session start on a hook error.
        sys.exit(0)
