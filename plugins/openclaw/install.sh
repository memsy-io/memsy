#!/usr/bin/env bash
# Install the Memsy plugin for OpenClaw.
# Builds from source and installs locally.
# Usage: ./install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Pre-flight ────────────────────────────────────────────────────────────────
if ! command -v openclaw &>/dev/null; then
  echo "Error: openclaw CLI not found."
  echo "Install: https://docs.openclaw.ai/install"
  exit 1
fi

if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
  echo "Error: node and npm are required to build the plugin."
  echo "Install: https://nodejs.org"
  exit 1
fi

# ── Build ─────────────────────────────────────────────────────────────────────
echo "Building Memsy plugin..."
cd "${SCRIPT_DIR}"
npm install --silent
npm run build
echo "✓ Plugin built."

# ── Install plugin ────────────────────────────────────────────────────────────
# openclaw plugins install copies the JS to ~/.openclaw/extensions/ and
# registers the entry in openclaw.json. It does NOT copy openclaw.plugin.json,
# so we copy the manifest manually to the same directory.
OPENCLAW_HOME="${OPENCLAW_HOME:-${HOME}/.openclaw}"
EXTENSIONS_DIR="${OPENCLAW_HOME}/extensions"

echo "Installing plugin..."
openclaw plugins install --force "${SCRIPT_DIR}/dist/index.js"
cp "${SCRIPT_DIR}/openclaw.plugin.json" "${EXTENSIONS_DIR}/openclaw.plugin.json"
echo "✓ Plugin installed."

# ── Install skills ────────────────────────────────────────────────────────────
echo "Installing skills..."
openclaw skills install --global --force --as memsy-recall   "${SCRIPT_DIR}/skills/memsy-recall"
openclaw skills install --global --force --as memsy-remember "${SCRIPT_DIR}/skills/memsy-remember"
echo "✓ Skills installed."

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Memsy for OpenClaw installed."
echo ""
if [[ -z "${MEMSY_API_KEY:-}" ]]; then
  echo "Set your API key before starting OpenClaw:"
  echo "  export MEMSY_API_KEY=msy_..."
else
  echo "✓ MEMSY_API_KEY is set."
fi
echo ""
echo "Start OpenClaw:"
echo "  openclaw start"
echo ""
echo "Optional: enable auto-context (injects recent memories at session start):"
echo "  export MEMSY_SESSION_AUTOCONTEXT=on"
echo ""
echo "Verify: ask your agent 'What do we know about X?' to test recall."
echo "Docs: https://memsy.io/docs/openclaw"
