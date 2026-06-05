#!/usr/bin/env bash
# session-start.sh — Memsy auto-context for Codex's SessionStart hook.
#
# OPT-IN: does nothing unless MEMSY_SESSION_AUTOCONTEXT=on, MEMSY_PROACTIVE=on,
# or MEMSY_CONFIRM_STORE=on is set in the environment. All modes default OFF.
#
# Codex injects SessionStart hook output as developer context — but it requires
# the output to be a JSON object of the form
#   {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}
# Plain text is rejected at runtime ("hook returned invalid session start JSON
# output"), which silently drops every block below. So we build the
# human-readable text exactly as before, then JSON-encode it once at the end.

set -eu

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    on|true|1|yes|enabled) return 0 ;;
    *) return 1 ;;
  esac
}

# First-run onboarding nudge (one-time, network-free). If the active profile has
# no default roles/teams configured, surface a single pointer to the setup flow,
# then never again (marker file). Reads only ~/.memsy/config.json (+ a project
# .memsy/config.json) — no network on this session-start path. The flow itself
# (memsy_list_roles/teams → create-or-pick → memsy_set_defaults) surfaces the
# org's existing roles/teams or offers to create them; this just gets the user
# there once. Defaults are optional, so this is a nudge, not a gate.
memsy_onboarding_nudge() {
  local marker="${HOME}/.memsy/.onboard-nudged"
  [[ -f "$marker" ]] && return 0
  command -v python3 >/dev/null 2>&1 || return 0

  local configured
  configured="$(python3 - <<'PY' 2>/dev/null
import json, os

def defaults_set(path, active):
    try:
        with open(path) as f:
            cfg = json.load(f)
    except Exception:
        return False
    profs = cfg.get("profiles")
    p = (profs.get(active) or {}) if isinstance(profs, dict) else cfg
    roles = p.get("default_role_ids") or p.get("defaultRoleIds")
    teams = p.get("default_team_ids") or p.get("defaultTeamIds")
    return bool(roles) or bool(teams)

home = os.path.expanduser("~")
gpath = os.path.join(home, ".memsy", "config.json")
ppath = os.path.join(os.getcwd(), ".memsy", "config.json")

active = os.environ.get("MEMSY_PROFILE") or ""
if not active:
    try:
        with open(gpath) as f:
            active = json.load(f).get("active_profile") or "default"
    except Exception:
        active = "default"

env_set = bool(os.environ.get("MEMSY_DEFAULT_ROLE_IDS") or os.environ.get("MEMSY_DEFAULT_TEAM_IDS"))
print("1" if (env_set or defaults_set(gpath, active) or defaults_set(ppath, active)) else "0")
PY
)" || configured=0

  [[ "$configured" == "1" ]] && return 0

  mkdir -p "${HOME}/.memsy"
  : > "$marker"
  cat <<'EOF'
[memsy setup — first run]

No default Memsy roles/teams are configured yet (optional — they sharpen recall
and attribution). Tell the user once, in one line, that you can set this up. If
they agree (or say "set up my memsy defaults", or invoke the setup-defaults
prompt): call memsy_list_roles and memsy_list_teams — show what their org
already has, or offer to create some via memsy_create_role / memsy_create_team —
then memsy_set_defaults (persist:"global"). If they decline, drop it; this won't repeat.

EOF
}

# Build the full session-start context as plain text on stdout. Captured by the
# caller and JSON-wrapped before being handed to Codex.
generate_context() {
  memsy_onboarding_nudge

  # Mode block — emitted whenever any mode is active. Skills read this to learn
  # the user's runtime preferences.
  local modes=""
  if is_truthy "${MEMSY_CONFIRM_STORE:-}"; then
    modes="${modes} confirm-before-store"
  fi
  if is_truthy "${MEMSY_PROACTIVE:-}"; then
    modes="${modes} proactive"
  fi
  if [[ -n "$modes" ]]; then
    printf '[memsy modes:%s]\n\n' "$modes"
  fi

  # Proactive mode — watch the conversation for save-worthy content and store
  # via memsy_ingest without requiring an explicit "remember that" verb.
  if is_truthy "${MEMSY_PROACTIVE:-}"; then
    cat <<'EOF'
[memsy proactive mode — MEMSY_PROACTIVE=on]

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

EOF
  fi

  # Auto-context recall — fires only when MEMSY_SESSION_AUTOCONTEXT is on.
  if ! is_truthy "${MEMSY_SESSION_AUTOCONTEXT:-}"; then
    return 0
  fi

  local LIMIT="${MEMSY_SESSION_CONTEXT_LIMIT:-6}"
  if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
    LIMIT=6                      # non-numeric (typo, empty) → safe default
  elif (( 10#$LIMIT < 1 )); then
    LIMIT=1                      # clamp up to the floor
  elif (( 10#$LIMIT > 20 )); then
    LIMIT=20                     # clamp down to the ceiling (e.g. 25 → 20)
  else
    LIMIT="$((10#$LIMIT))"
  fi

  cat <<EOF
[memsy auto-context — MEMSY_SESSION_AUTOCONTEXT=on]

Before processing the user's first message in this session, call the
memsy_list_memories MCP tool with these arguments:

  limit: ${LIMIT}
  sort:  "observed_at_desc"

Then surface the results as a single block titled "Memsy recall (top ${LIMIT})",
each memory on its own line:

  N. <memory text, truncate to 200 chars> — <observed_at>

Rules:
- If the tool errors or returns 0 memories, output nothing and proceed normally.
- Do not call memsy_list_memories again on subsequent turns for context.
  Later searches should be user-intent-driven (memsy-recall skill).

To disable: unset MEMSY_SESSION_AUTOCONTEXT and restart Codex.
EOF
}

content="$(generate_context)"

# Emit ONLY when there's something to say, wrapped in the JSON envelope Codex
# requires for SessionStart hooks. python3 (already used above) does the JSON
# encoding so embedded quotes/newlines are escaped correctly; if it's somehow
# unavailable we stay silent rather than emit text Codex would reject.
if [ -n "$(printf '%s' "$content" | tr -d '[:space:]')" ] && command -v python3 >/dev/null 2>&1; then
  printf '%s' "$content" | python3 -c 'import json, sys; print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": sys.stdin.read()}}))'
fi
