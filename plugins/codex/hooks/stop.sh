#!/usr/bin/env bash
# stop.sh — turn-sync: POST the completed user+assistant turn to Memsy /ingest.
#
# OPT-IN: does nothing unless MEMSY_TURN_SYNC is on. Pairs the prompt captured by
# user-prompt-submit.sh with this turn's last_assistant_message. Emits NOTHING to
# stdout (Codex rejects non-JSON Stop output and could read stray output as a
# continue decision) and always exits 0, so the turn ends normally.
#
# Hooks run SYNCHRONOUSLY (Codex parses `async` but skips it), so the POST is
# best-effort with a short timeout — see HTTP_TIMEOUT in turn_sync.py. Failures
# are logged to ~/.memsy/turn-sync.log and never block the turn.
set -eu

case "$(printf '%s' "${MEMSY_TURN_SYNC:-}" | tr '[:upper:]' '[:lower:]')" in
  on|true|1|yes|enabled) ;;
  *) exit 0 ;;
esac
command -v python3 >/dev/null 2>&1 || exit 0

mkdir -p "${HOME}/.memsy"
cat | python3 "$(dirname "$0")/turn_sync.py" sync 2>>"${HOME}/.memsy/turn-sync.log" || true
exit 0
