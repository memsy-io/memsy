#!/usr/bin/env bash
# session-start.sh — thin shim for Codex's SessionStart hook.
#
# The real logic lives in session_start.py. We deliberately do NOT do the work
# in bash: the macOS default shell (bash 3.2) has a long-standing parser bug
# with heredocs-in-command-substitution that silently broke the previous all-
# bash version (parse error → Codex swallows the non-zero exit → every
# SessionStart-gated feature quietly never fires). python3 is already a hard
# dependency, so the logic runs there and this shim just forwards stdin.
#
# Kept as a .sh (not a direct python3 entry in hooks.json) so the hook command
# and every doc reference to session-start.sh stay stable.
command -v python3 >/dev/null 2>&1 || exit 0
exec python3 "$(dirname "$0")/session_start.py"
