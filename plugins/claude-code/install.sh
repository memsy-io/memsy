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
    echo "❌ $SERVER_JS not found." >&2
    echo "   Build the MCP first: (cd $ABS_MONOREPO/mcp && npm run build)" >&2
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

# Default: no mode — just print prerequisites + next steps.
echo "✅ Node $(node -v) detected."
echo ""
echo "Next steps:"
echo "  1. Get an API key at https://app.memsy.io and set it in your shell:"
echo "       export MEMSY_API_KEY=msy_..."
echo "  2. Restart Claude Code so the plugin's MCP config is loaded."
echo "  3. Run /memsy-doctor in Claude Code to verify."
echo ""
echo "Local-build mode (for iterating on @memsy-io/mcp itself):"
echo "  ./install.sh --dev /path/to/memsy"
