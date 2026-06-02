#!/usr/bin/env bash
# post-response.sh — Memsy Stop hook for Claude Code.
#
# Fires after every Claude response. Ingests the last user+assistant turn to
# Memsy so the memory extraction pipeline can decide what's worth keeping —
# no LLM judgment needed here, just ship the turn and let Memsy's async
# worker sort it out.
#
# OPT-IN: does nothing unless MEMSY_TURN_SYNC=on (add to ~/.zshrc or ~/.bashrc):
#   export MEMSY_TURN_SYNC=on
#
# This fills the gap that proactive mode can't: proactive mode watches for
# assertions Claude can classify mid-turn; turn sync captures everything
# including conclusions, explanations, and decisions buried in long responses
# that proactive mode's keyword heuristics would miss.
#
# Runs async — zero latency added to Claude Code responses.

set -eu

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    on|true|1|yes|enabled) return 0 ;;
    *) return 1 ;;
  esac
}

is_truthy "${MEMSY_TURN_SYNC:-}" || exit 0

MEMSY_API_KEY="${MEMSY_API_KEY:-}"
MEMSY_BASE_URL="${MEMSY_BASE_URL:-https://api.memsy.io/v1}"

[[ -z "$MEMSY_API_KEY" ]] && exit 0

# ── Parse transcript + extract last turn (single python3 process) ─────────────
# Reads the transcript_path from Stop hook stdin, then walks the JSONL file
# backwards to find the last substantive user+assistant turn.
# Reads lines in reverse without loading the full file into memory.
TURN_JSON="$(cat | python3 -c "
import json, sys, os

# Parse Stop hook stdin
try:
    hook_data = json.load(sys.stdin)
    transcript_path = hook_data.get('transcript_path', '') or ''
except Exception:
    sys.exit(0)

# Also honour the env-var fallback Claude Code may set
if not transcript_path:
    transcript_path = os.environ.get('CLAUDE_TRANSCRIPT_PATH', '')

if not transcript_path or not os.path.isfile(transcript_path):
    sys.exit(0)

def extract_text(content):
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return ' '.join(
            b.get('text', '').strip()
            for b in content
            if isinstance(b, dict) and b.get('type') == 'text'
        ).strip()
    return ''

user_text = ''
assistant_text = ''
found_assistant = False

# Read lines without loading the entire file into a list first.
with open(transcript_path) as f:
    lines = f.readlines()

for line in reversed(lines):
    try:
        obj = json.loads(line)
    except Exception:
        continue

    entry_type = obj.get('type', '')
    msg = obj.get('message', {})

    if entry_type == 'assistant' and not found_assistant:
        text = extract_text(msg.get('content', ''))
        if len(text) >= 40:
            assistant_text = text[:32000]
            found_assistant = True

    elif entry_type == 'user' and found_assistant and not user_text:
        content = msg.get('content', '')
        if isinstance(content, list):
            text_blocks = [
                b for b in content
                if isinstance(b, dict) and b.get('type') == 'text'
            ]
            if not text_blocks:
                continue
            text = ' '.join(b.get('text', '') for b in text_blocks).strip()
        else:
            text = str(content).strip()
        if len(text) >= 10:
            user_text = text[:32000]
        break

if not assistant_text:
    sys.exit(0)

events = []
if user_text:
    events.append({'kind': 'user_message', 'content': user_text})
events.append({'kind': 'assistant_message', 'content': assistant_text})
print(json.dumps({'events': events}))
" 2>/dev/null)"

[[ -z "$TURN_JSON" ]] && exit 0

# ── Fire and forget ───────────────────────────────────────────────────────────
# Errors are logged to ~/.memsy/turn-sync.log for debugging. The log is only
# written on failure — on success curl exits 0 and writes nothing.
MEMSY_LOG_DIR="${HOME}/.memsy"
mkdir -p "$MEMSY_LOG_DIR"

curl -s -o /dev/null \
  --max-time 10 \
  --write-out "%{http_code}" \
  -X POST "${MEMSY_BASE_URL}/ingest" \
  -H "Authorization: Bearer ${MEMSY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$TURN_JSON" 2>&1 | {
    read -r http_code
    if [[ "$http_code" != "200" && "$http_code" != "201" && "$http_code" != "202" ]]; then
      printf '[%s] turn-sync failed: HTTP %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$http_code" \
        >> "${MEMSY_LOG_DIR}/turn-sync.log"
    fi
  } &

exit 0
