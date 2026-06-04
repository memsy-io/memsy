#!/usr/bin/env bash
# install.sh — Memsy Claude Code plugin helper.
#
# Usage:
#   ./install.sh                         Print prerequisites + next-step instructions.
#   ./install.sh --dev <monorepo-path>   Rewrite .mcp.json to use a locally built
#                                        @memsy-io/mcp at <monorepo-path>/mcp/dist/server.js
#                                        (for iterating on the MCP server itself).
#   ./install.sh --prod                  Restore .mcp.json to npx @memsy-io/mcp.
#   ./install.sh -h | --help             Show this help.

set -euo pipefail

usage() {
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
}

MODE=""
DEV_PATH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      MODE="dev"
      DEV_PATH="${2:-}"
      if [[ -z "$DEV_PATH" ]]; then
        echo "❌ --dev requires a path to the memsy monorepo." >&2
        exit 2
      fi
      shift 2
      ;;
    --prod)
      MODE="prod"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "❌ unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# --- Node check ---------------------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js not found. Memsy's MCP server requires Node 18+." >&2
  echo "   Install Node from https://nodejs.org or via your package manager, then re-run." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "❌ Node $(node -v) detected. Memsy requires Node 18+." >&2
  exit 1
fi

# --- Resolve plugin paths -----------------------------------------------------

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_CONFIG="$PLUGIN_DIR/.mcp.json"

write_prod_config() {
  cat > "$MCP_CONFIG" <<'EOF'
{
  "mcpServers": {
    "memsy": {
      "command": "npx",
      "args": ["-y", "@memsy-io/mcp"]
    }
  }
}
EOF
}

write_dev_config() {
  local server_js="$1"
  cat > "$MCP_CONFIG" <<EOF
{
  "mcpServers": {
    "memsy": {
      "command": "node",
      "args": ["$server_js"]
    }
  }
}
EOF
}

# --- Execute mode -------------------------------------------------------------

if [[ "$MODE" == "dev" ]]; then
  if [[ ! -d "$DEV_PATH" ]]; then
    echo "❌ $DEV_PATH is not a directory." >&2
    exit 1
  fi
  ABS_MONOREPO="$(cd "$DEV_PATH" && pwd)"
  SERVER_JS="$ABS_MONOREPO/mcp/dist/server.js"
  if [[ ! -f "$SERVER_JS" ]]; then
    echo "❌ MCP isn't built yet — $SERVER_JS doesn't exist." >&2
    echo "" >&2
    echo "   The MCP source is present but you haven't run the build step." >&2
    echo "   'npm install' only installs dependencies; you also need:" >&2
    echo "" >&2
    echo "     cd $ABS_MONOREPO/mcp" >&2
    echo "     npm run build" >&2
    echo "" >&2
    echo "   Then re-run this command." >&2
    exit 1
  fi
  write_dev_config "$SERVER_JS"
  echo "✅ Rewrote $MCP_CONFIG to use local build at $SERVER_JS"
  echo "   Restart Claude Code to pick up the change."
  exit 0
fi

if [[ "$MODE" == "prod" ]]; then
  write_prod_config
  echo "✅ Restored $MCP_CONFIG to npx @memsy-io/mcp"
  echo "   Restart Claude Code to pick up the change."
  exit 0
fi

# Default: no mode — prereqs OK; offer interactive key setup + next steps.
echo "✅ Node $(node -v) detected."
echo ""

# ── Interactive API key setup ─────────────────────────────────────────────────
# The MCP server reads the key from $MEMSY_API_KEY (Claude Code passes the
# launching shell's env to MCP children) OR from ~/.memsy/config.json. Saving it
# to the config file means you don't have to export it in every shell that
# launches Claude Code — and the same file is shared with other MCP hosts
# (Cursor, Cline, Codex). Auto-skips when a key is already saved, in
# non-interactive shells (CI), or when python3 is unavailable.
MEMSY_CONFIG="${HOME}/.memsy/config.json"

_memsy_manual_key_help() {
  echo "  To set it: re-run ./install.sh, or export it in the shell that launches"
  echo "  Claude Code, then restart:  export MEMSY_API_KEY=msy_..."
}

if ! command -v python3 >/dev/null 2>&1 || [[ ! -t 0 ]]; then
  echo "Set your Memsy API key (get one at https://app.memsy.io):"
  _memsy_manual_key_help
else
  saved_key="$(MEMSY_CONFIG="$MEMSY_CONFIG" python3 - <<'PY' 2>/dev/null
import json, os
try:
    cfg = json.load(open(os.environ["MEMSY_CONFIG"]))
except Exception:
    cfg = {}
profs = cfg.get("profiles") if isinstance(cfg, dict) else None
active = cfg.get("active_profile") if isinstance(cfg, dict) and isinstance(cfg.get("active_profile"), str) and cfg.get("active_profile") else "default"
prof = profs.get(active) if isinstance(profs, dict) else (cfg if isinstance(cfg, dict) else {})
print((prof or {}).get("api_key", "") if isinstance(prof, dict) else "")
PY
)" || saved_key=""

  if [[ -n "$saved_key" ]]; then
    echo "✓ Memsy API key already saved in ${MEMSY_CONFIG} — the MCP reads it from there."
  else
    if [[ -n "${MEMSY_API_KEY:-}" ]]; then
      printf "Found MEMSY_API_KEY in your environment. Save it to %s (persists across shells)? [Y/n] " "$MEMSY_CONFIG"
      read -r _ans || _ans=""
      if [[ "$_ans" =~ ^[Nn] ]]; then _key=""; else _key="$MEMSY_API_KEY"; fi
    else
      printf "Enter your Memsy API key (msy_..., from https://app.memsy.io) to save it now, or press Enter to skip: "
      read -r _key || _key=""
    fi
    if [[ -n "${_key// /}" ]]; then
      if MEMSY_CONFIG="$MEMSY_CONFIG" MEMSY_KEY_INPUT="$_key" python3 - <<'PY'
import json, os
path = os.environ["MEMSY_CONFIG"]
key = os.environ["MEMSY_KEY_INPUT"].strip()
os.makedirs(os.path.dirname(path), exist_ok=True)
try:
    cfg = json.load(open(path))
    if not isinstance(cfg, dict):
        cfg = {}
except Exception:
    cfg = {}
profs = cfg.get("profiles")
if not isinstance(profs, dict):
    profs = {}
active = cfg.get("active_profile") if isinstance(cfg.get("active_profile"), str) and cfg.get("active_profile") else "default"
prof = profs.get(active)
if not isinstance(prof, dict):
    prof = {}
prof["api_key"] = key
profs[active] = prof
cfg["profiles"] = profs
cfg["active_profile"] = active
# Atomic write + 0600 (the file holds an API key).
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(cfg, f, indent=2)
os.chmod(tmp, 0o600)
os.replace(tmp, path)
PY
      then
        echo "✓ API key saved to ${MEMSY_CONFIG} (chmod 600). No export needed — the MCP reads it from there."
      else
        echo "⚠ Could not write ${MEMSY_CONFIG}."
        _memsy_manual_key_help
      fi
    else
      echo "  Skipped."
      _memsy_manual_key_help
    fi
  fi
fi

echo ""
echo "Next steps:"
echo "  1. Restart Claude Code so the plugin's MCP config (and your key) load."
echo "  2. Run /memsy-doctor in Claude Code to verify."
echo ""
echo "Local-build mode (for iterating on @memsy-io/mcp itself):"
echo "  ./install.sh --dev /path/to/memsy"
