#!/usr/bin/env bash
# Install Memsy integration for Hermes Agent (NousResearch).
# Usage: ./install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. Verify hermes is installed ─────────────────────────────────────────────
if ! command -v hermes &>/dev/null; then
  echo "Error: hermes CLI not found."
  echo "Install: npm install -g @nousresearch/hermes-agent"
  echo "Docs: https://hermes-agent.nousresearch.com"
  exit 1
fi

# ── 2. Register MCP server ────────────────────────────────────────────────────
HERMES_CONFIG="${HOME}/.hermes/config.yaml"
mkdir -p "${HOME}/.hermes"

# Create config file if absent
if [[ ! -f "${HERMES_CONFIG}" ]]; then
  touch "${HERMES_CONFIG}"
fi

if grep -q '^\s*memsy:' "${HERMES_CONFIG}" 2>/dev/null; then
  echo "  memsy already present in ${HERMES_CONFIG} — skipping."
else
  # If mcp_servers section exists, append inside it; otherwise create it
  if grep -q '^mcp_servers:' "${HERMES_CONFIG}"; then
    # Append memsy block after the mcp_servers: line
    # Use Python for safe YAML manipulation
    python3 - <<'PY'
import os, re

config_path = os.path.expanduser("~/.hermes/config.yaml")
with open(config_path) as f:
    content = f.read()

memsy_block = """\
  memsy:
    command: npx
    args: ["-y", "@memsy-io/mcp"]
    enabled: true
    env:
      MEMSY_API_KEY: "${MEMSY_API_KEY}"
"""

# Insert after `mcp_servers:` line
content = re.sub(
    r"(^mcp_servers:\s*\n)",
    r"\1" + memsy_block,
    content,
    count=1,
    flags=re.MULTILINE,
)

with open(config_path, "w") as f:
    f.write(content)

print(f"✓ Added memsy under mcp_servers in {config_path}")
PY
  else
    # Append a new mcp_servers section
    cat >> "${HERMES_CONFIG}" <<'YAML'

mcp_servers:
  memsy:
    command: npx
    args: ["-y", "@memsy-io/mcp"]
    enabled: true
    env:
      MEMSY_API_KEY: "${MEMSY_API_KEY}"
YAML
    echo "✓ Added mcp_servers.memsy to ${HERMES_CONFIG}"
  fi
fi

# ── 3. Verify ─────────────────────────────────────────────────────────────────
echo ""
echo "Memsy for Hermes installed."
echo ""
echo "Verify:"
echo "  1. Set MEMSY_API_KEY (Hermes reads env at startup):"
echo "     export MEMSY_API_KEY=msy_..."
echo "     hermes chat"
echo ""
echo "  2. In the Hermes chat, ask:"
echo "     'What do we know about X?' — to test recall via memsy_search"
echo "     'Remember that we use Postgres for billing' — to test store via memsy_ingest"
echo ""
echo "  3. Or reload MCP without restarting: /reload-mcp"
echo ""
echo "  Docs: https://memsy.io/docs/hermes"
