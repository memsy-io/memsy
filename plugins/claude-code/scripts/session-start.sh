#!/usr/bin/env bash
# session-start.sh — Memsy auto-context for Claude Code's SessionStart hook.
#
# OPT-IN: this hook does nothing unless MEMSY_SESSION_AUTOCONTEXT=on is set in
# the shell that launched Claude Code. We default OFF because token-bursting
# every session start with stale memories is worse than no auto-context until
# the user explicitly turns it on.
#
# When enabled, this script prints an instruction to stdout. Claude Code injects
# SessionStart stdout as context Claude sees before the first user message — so
# the instruction tells Claude to call memsy_list_memories and surface the most
# recent memories as a "Memsy recall" block.
#
# We do NOT spawn a memsy-mcp child from this script to make the call ourselves
# — the plugin's bundled MCP is already loaded by Claude Code, so the cheapest
# path is to instruct Claude to use the existing connection.

set -eu

# Helper: decide whether a Memsy env flag is set to a truthy value.
# Accepts the conventional truthy variants users actually type, lower-cased —
# `true`/`1`/`yes`/`on`/`enabled`. Anything else (unset, empty, `off`, typos
# like `Yes!`) is treated as off.
is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    on|true|1|yes|enabled) return 0 ;;
    *) return 1 ;;
  esac
}

# Mode block: emit a small "[memsy modes: ...]" line whenever any plugin mode
# is set. SessionStart hook stdout is injected into Claude's context, so this
# is how skill/command bodies learn the user's runtime preferences. Modes are
# independent — a user can opt into confirm-before-store WITHOUT also enabling
# the recall auto-context below.
modes=""
if is_truthy "${MEMSY_CONFIRM_STORE:-}"; then
  modes="${modes} confirm-before-store"
fi
if is_truthy "${MEMSY_PROACTIVE:-}"; then
  modes="${modes} proactive"
fi
if is_truthy "${MEMSY_TURN_SYNC:-}"; then
  modes="${modes} turn-sync"
fi
if [[ -n "$modes" ]]; then
  printf '[memsy modes:%s]\n\n' "$modes"
fi

# Proactive mode — when MEMSY_PROACTIVE is on, emit a detailed instruction
# block telling Claude to actively watch the conversation for save-worthy
# content (preferences, intents, decisions, learnings) and store via
# memsy_ingest WITHOUT requiring an explicit "remember that" verb. This
# bridges the gap that surfaced in real use: a user saying "I plan to go to
# the FIFA World Cup" is a crucial preference, but the conservative
# memsy-remember skill only fires on explicit save verbs.
if is_truthy "${MEMSY_PROACTIVE:-}"; then
  cat <<'EOF'
[memsy proactive mode — MEMSY_PROACTIVE=on]

For the rest of this conversation, actively watch for content the user
clearly wants remembered, EVEN IF they don't say "remember that" or "save
this". When you spot it, store it via memsy_ingest. Categories that
qualify:

  - Personal preferences:   "I like X", "my favorite is Y", "I prefer Z"
  - Intents / plans:        "I want to do X", "I plan to Y", "I'm going to Z"
  - Decisions:              "we decided X", "going with Y", "switching to Z"
  - Constraints discovered: "X doesn't work because Y", "we can't do Z"
  - Learnings:              "turns out X", "the trick is Y", "found that Z"

Workflow per save-worthy item:

  1. Pre-flight (same as memsy-remember skill):
     - too short (<20 chars) → skip, don't ask.
     - secret-shaped token (msy_/sk_/ghp_/Bearer) → skip, don't ask.
     - already stored this session (same substance) → skip, don't double-save.

  2. If [memsy modes: ... confirm-before-store ...] is ALSO in your
     context, ask before storing:

         Memsy will store:
           <substance, standalone sentence>

         Save? (y / n / edit "<new text>")

     Otherwise (default), store directly without asking — opting into
     proactive mode is the user pre-authorizing the saves.

  3. Call memsy_ingest with ONE event:
       kind:     "user_message"
       content:  the substance (standalone, no framing)
       ts:       current ISO 8601
       metadata: JSON.stringify({source:"claude-code-proactive",
                                  safe_to_delete:true})

  4. Acknowledge concisely AFTER answering whatever the user actually
     asked, with a one-liner like:

         → saved to Memsy: "<first 60 chars>..." (event <id>)

     Do NOT interrupt the user's primary task. The save is secondary;
     the answer they asked for comes first.

Hard rules:

  - Do NOT save every sentence. Save things that would be useful in a
    later session (3+ months from now). Ephemeral context — "let me try
    X", "what about Y" — is noise, not memory.
  - Do NOT ask "do you want me to remember that?" every turn. Either
    you save (with the confirm-before-store check if enabled) or you
    don't. Asking each time is worse UX than either pure mode.
  - Do NOT save the user's question itself when they ask you something.
    Save substantive content they assert as theirs ("I want X") —
    not their queries ("how do I X?").

To disable: unset MEMSY_PROACTIVE in your shell and restart Claude Code.

EOF
fi

# Recall auto-context — separate, only fires when MEMSY_SESSION_AUTOCONTEXT is
# truthy. If neither this nor any mode flag above was set, the script has
# already finished its observable work and is about to exit 0 silently.
if ! is_truthy "${MEMSY_SESSION_AUTOCONTEXT:-}"; then
  exit 0
fi

# Pick a recall budget. Override via MEMSY_SESSION_CONTEXT_LIMIT=N (default 6).
LIMIT="${MEMSY_SESSION_CONTEXT_LIMIT:-6}"

# Be defensive about the limit — clamp to a sane range so the hook can't be
# weaponized to burn the whole context window via an env var. `10#$LIMIT`
# forces base-10 arithmetic, so values like `08` and `09` don't crash on
# bash's octal interpretation.
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

Then surface the results to the user as a single tidy block titled
"Memsy recall (top ${LIMIT})", with each memory on its own line:

  N. <memory text, truncate to 200 chars> — <observed_at>

Rules:
- If the tool errors or returns 0 memories, output nothing at all about
  recall and proceed normally. Do not announce the auto-context's failure;
  just be silent.
- Do not pad the block with framing or commentary — the user already opted
  in, they know what this is.
- Do not call memsy_list_memories again on subsequent turns just because
  the user asked a related question. The recall block above is for context
  only; later searches should be triggered by the user's intent (slash
  command or natural-language phrasing the memsy-recall skill catches).

To disable this auto-context, unset MEMSY_SESSION_AUTOCONTEXT in your shell
and restart Claude Code.
EOF
