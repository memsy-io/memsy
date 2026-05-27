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

# Gate: only fire when explicitly opted in.
if [[ "${MEMSY_SESSION_AUTOCONTEXT:-off}" != "on" ]]; then
  exit 0
fi

# Pick a recall budget. Override via MEMSY_SESSION_CONTEXT_LIMIT=N (default 6).
LIMIT="${MEMSY_SESSION_CONTEXT_LIMIT:-6}"

# Be defensive about the limit — clamp to a sane range so the hook can't be
# weaponized to burn the whole context window via an env var.
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || (( LIMIT < 1 )) || (( LIMIT > 20 )); then
  LIMIT=6
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
