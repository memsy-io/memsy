#!/usr/bin/env bash
# user-prompt-submit.sh — stash the user's prompt for turn-sync pairing.
#
# OPT-IN: does nothing unless MEMSY_TURN_SYNC is on. Emits NOTHING to stdout and
# always exits 0, so the prompt always proceeds unchanged (blocking a prompt in
# Codex requires `{"decision":"block"}` or exit 2 — we never do either).
set -eu

case "$(printf '%s' "${MEMSY_TURN_SYNC:-}" | tr '[:upper:]' '[:lower:]')" in
  on|true|1|yes|enabled) ;;
  *) exit 0 ;;
esac
command -v python3 >/dev/null 2>&1 || exit 0

mkdir -p "${HOME}/.memsy"
# Codex passes the hook payload (incl. the prompt) on stdin; forward it to the
# shared impl. stderr → log so nothing reaches Codex's stdout parser.
cat | python3 "$(dirname "$0")/turn_sync.py" capture 2>>"${HOME}/.memsy/turn-sync.log" || true
exit 0
