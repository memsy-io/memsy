#!/usr/bin/env bash
# Install Memsy integration for OpenClaw.
# Usage: ./install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. Verify python3 is available (needed for JSON merge) ────────────────────
if ! command -v python3 &>/dev/null; then
  echo "Error: python3 is required for this installer."
  exit 1
fi

# ── 2. Register MCP server ────────────────────────────────────────────────────
python3 - <<'PY'
import json, os, sys

config_path = os.path.expanduser("~/.openclaw/openclaw.json")
os.makedirs(os.path.dirname(config_path), exist_ok=True)

try:
    with open(config_path) as f:
        config = json.load(f)
except FileNotFoundError:
    config = {}
except json.JSONDecodeError as e:
    print(f"Error: {config_path} is not valid JSON: {e}")
    sys.exit(1)

mcp_servers = config.setdefault("mcpServers", {})

if "memsy" in mcp_servers:
    print(f"  memsy already in mcpServers — skipping.")
    sys.exit(0)

mcp_servers["memsy"] = {
    "command": "npx",
    "args": ["-y", "@memsy-io/mcp"],
    "env": {
        "MEMSY_API_KEY": "${MEMSY_API_KEY}"
    }
}

with open(config_path, "w") as f:
    json.dump(config, f, indent=2)
    f.write("\n")

print(f"✓ Added memsy to mcpServers in {config_path}")
PY

# ── 3. Install skills ─────────────────────────────────────────────────────────
SKILL_DIR="${HOME}/.openclaw/workspace/skills"
for skill in memsy-recall memsy-remember; do
  src="${SCRIPT_DIR}/skills/${skill}/SKILL.md"
  dst="${SKILL_DIR}/${skill}/SKILL.md"
  if [[ -f "${src}" ]]; then
    mkdir -p "${SKILL_DIR}/${skill}"
    cp "${src}" "${dst}"
    echo "✓ Installed skill: ${skill}"
  fi
done

# ── 4. Verify ─────────────────────────────────────────────────────────────────
echo ""
echo "Memsy for OpenClaw installed."
echo ""
echo "Verify:"
echo "  1. Set MEMSY_API_KEY in your environment before starting OpenClaw:"
echo "     export MEMSY_API_KEY=msy_..."
echo "     openclaw start"
echo ""
echo "  2. In any connected chat app, say:"
echo "     'What do we know about X?' — to test recall"
echo "     'Remember that we use Postgres for billing' — to test store"
echo ""
echo "  Docs: https://memsy.io/docs/openclaw"
