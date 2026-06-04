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
import json, sys, os, hashlib, subprocess

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

# Load the transcript, then scan newest-first for the last full turn.
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

# Identity MUST match what the MCP server derives (mcp/src/identity.ts:
# resolveActorId), or turn-synced memories land under a different actor_id
# than the one memsy_search / memsy_list_memories read — and recall silently
# finds nothing. FULL precedence mirrored: MEMSY_ACTOR_ID env → the active
# profile's actor_id pinned in ~/.memsy/config.json (this is what
# /memsy:memsy-setup writes via memsy_set_defaults) → sha256('<profile>|<git-
# email>')[:16] → sha256('<profile>|user@host')[:16]. Profile name resolves
# MEMSY_PROFILE env → config active_profile → 'default', same as the MCP.
def _git_email():
    for scope in (['--global'], []):
        try:
            out = subprocess.run(
                ['git', 'config', *scope, '--get', 'user.email'],
                capture_output=True, text=True, timeout=2,
            )
            v = out.stdout.strip()
            if v:
                return v
        except Exception:
            pass
    return ''

def _hash_id(*parts):
    return hashlib.sha256('|'.join(parts).encode()).hexdigest()[:16]

def _load_config():
    # Mirror the MCP's findConfigFile (config.ts): a per-project
    # .memsy/config.json overrides the per-user one, WHOLE-FILE — the project
    # file is used exclusively when present, never merged key-by-key.
    base = os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd()
    for path in (os.path.join(base, '.memsy', 'config.json'),
                 os.path.expanduser('~/.memsy/config.json')):
        try:
            if os.path.isfile(path):
                with open(path) as f:
                    raw = json.load(f)
                return raw if isinstance(raw, dict) else {}
        except Exception:
            return {}
    return {}

def _resolve_profile(cfg):
    # profiles map, or legacy flat file wrapped as 'default'; active-name
    # precedence (MEMSY_PROFILE → active_profile → 'default') matches the MCP.
    profs = cfg.get('profiles') if isinstance(cfg.get('profiles'), dict) else None
    if profs is None and (cfg.get('api_key') or cfg.get('apiKey')):
        profs = {'default': cfg}
    active = (os.environ.get('MEMSY_PROFILE', '').strip()
              or (cfg.get('active_profile') if isinstance(cfg.get('active_profile'), str) else '')
              or 'default')
    prof = profs.get(active) if isinstance(profs, dict) else None
    return active, (prof if isinstance(prof, dict) else {})

actor_id = os.environ.get('MEMSY_ACTOR_ID', '').strip()
if not actor_id:
    _cfg = _load_config()
    profile, _prof = _resolve_profile(_cfg)
    # Tier 2: a pinned actor_id in the config file (matches MCP identity.ts:68).
    actor_id = (_prof.get('actor_id') or _prof.get('actorId') or '').strip()
    if not actor_id:
        email = _git_email()
        if email:
            actor_id = _hash_id(profile, email)
        else:
            import getpass, socket
            actor_id = _hash_id(profile, getpass.getuser() + '@' + socket.gethostname())

# session_id only needs to be non-empty and stable across the Stop hook's
# repeated fires within one Claude session — the transcript path is exactly
# that. Recall is actor-based, so it need not match the MCP's per-process id.
session_id = 'cc-' + hashlib.sha256(transcript_path.encode()).hexdigest()[:16]

def _event(kind, content):
    return {'kind': kind, 'content': content,
            'actor_id': actor_id, 'session_id': session_id}

events = []
if user_text:
    events.append(_event('user_message', user_text))
events.append(_event('assistant_message', assistant_text))
print(json.dumps({'events': events}))
" 2>/dev/null)"

[[ -z "$TURN_JSON" ]] && exit 0

# ── Deliver ───────────────────────────────────────────────────────────────────
# The Stop hook is registered async:true (see hooks.json), so Claude Code does
# NOT block the response on this script — we can run curl synchronously here
# without adding user-facing latency. We deliberately do NOT background curl
# with `& exit 0`: a detached grandchild gets reaped by Claude Code's process
# group teardown before its 10s curl returns, so the request never completes
# and the failure never reaches the log. Running it in the foreground of the
# (already async) hook is what makes both the ingest and its log reliable.
MEMSY_LOG_DIR="${HOME}/.memsy"
mkdir -p "$MEMSY_LOG_DIR"

# The `|| http_code="000"` is load-bearing under `set -e`: curl exits 0 on HTTP
# errors (422/500 still populate http_code and log below), but nonzero on
# TRANSPORT failures (timeout=28, DNS=6, refused=7). Without the `||`, a bare
# `var=$(curl …)` assignment would propagate that nonzero status and `set -e`
# would abort the script HERE — skipping the failure log, which is the exact
# silent-failure mode this hook is meant to fix. On transport failure we fall
# through to the log block with a sentinel "000".
http_code="$(curl -s -o /dev/null \
  --max-time 10 \
  --write-out '%{http_code}' \
  -X POST "${MEMSY_BASE_URL}/ingest" \
  -H "Authorization: Bearer ${MEMSY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$TURN_JSON" 2>>"${MEMSY_LOG_DIR}/turn-sync.log")" || http_code="000"

if [[ "$http_code" != "200" && "$http_code" != "201" && "$http_code" != "202" ]]; then
  printf '[%s] turn-sync failed: HTTP %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$http_code" \
    >> "${MEMSY_LOG_DIR}/turn-sync.log"
fi

exit 0
