#!/usr/bin/env bash
# session-start.sh — Memsy auto-context for Codex's SessionStart hook.
#
# OPT-IN: does nothing unless MEMSY_SESSION_AUTOCONTEXT=on, MEMSY_PROACTIVE=on,
# or MEMSY_CONFIRM_STORE=on is set in the environment. All modes default OFF.
#
# Codex injects SessionStart stdout as context before the first user message.

set -eu

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    on|true|1|yes|enabled) return 0 ;;
    *) return 1 ;;
  esac
}

# Mode block — emitted whenever any mode is active. Skills read this to learn
# the user's runtime preferences.
modes=""
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
       kind:     "user_message"
       content:  the substance (standalone, no framing)
       ts:       current ISO 8601
       metadata: JSON.stringify({source:"codex-proactive",safe_to_delete:true})

  4. Acknowledge AFTER answering what the user asked, one-liner:
       → saved to Memsy: "<first 60 chars>..." (event <id>)

Hard rules:
  - Save things useful 3+ months from now. Ephemeral context is noise.
  - Do NOT ask "do you want me to remember that?" every turn.
  - Do NOT save the user's questions — save what they assert as theirs.

To disable: unset MEMSY_PROACTIVE and restart Codex.

EOF
fi

# Auto-context recall — fires only when MEMSY_SESSION_AUTOCONTEXT is on.
if ! is_truthy "${MEMSY_SESSION_AUTOCONTEXT:-}"; then
  exit 0
fi

LIMIT="${MEMSY_SESSION_CONTEXT_LIMIT:-6}"
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || (( 10#$LIMIT < 1 )) || (( 10#$LIMIT > 20 )); then
  LIMIT=6
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
