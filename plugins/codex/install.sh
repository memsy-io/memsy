#!/usr/bin/env bash
# Install the Memsy plugin for Codex CLI via the Codex plugin system.
# Usage: ./install.sh
set -euo pipefail

if ! command -v codex &>/dev/null; then
  echo "Error: codex CLI not found."
  echo "Install: npm install -g @openai/codex"
  echo "Docs: https://developers.openai.com/codex"
  exit 1
fi

echo "Adding Memsy marketplace to Codex..."
codex plugin marketplace add memsy-io/memsy

echo "Installing Memsy plugin..."
codex plugin add memsy@memsy

echo ""
echo "Memsy for Codex installed."
echo ""
echo "Set your API key so the MCP server can authenticate:"
echo "  export MEMSY_API_KEY=msy_..."
echo ""
echo "Optional modes (set before starting Codex):"
echo "  export MEMSY_SESSION_AUTOCONTEXT=on   # surface recent memories at session start"
echo "  export MEMSY_PROACTIVE=on             # proactively store decisions/preferences"
echo "  export MEMSY_CONFIRM_STORE=on         # ask before storing"
echo ""
echo "Verify: start codex, then ask 'What do we know about X?' to test recall."
echo "Docs: https://memsy.io/docs/codex"
