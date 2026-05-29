#!/usr/bin/env bash
# Install the Memsy plugin for OpenClaw via ClawHub.
# Usage: ./install.sh
set -euo pipefail

if ! command -v openclaw &>/dev/null; then
  echo "Error: openclaw CLI not found."
  echo "Install: https://docs.openclaw.ai/install"
  exit 1
fi

echo "Installing Memsy plugin from ClawHub..."
openclaw plugins install clawhub:memsy-io/memsy-openclaw

echo ""
echo "Installing Memsy skills..."
openclaw skills install memsy-recall
openclaw skills install memsy-remember

echo ""
echo "Memsy for OpenClaw installed."
echo ""
echo "Set your API key before starting OpenClaw:"
echo "  export MEMSY_API_KEY=msy_..."
echo "  openclaw start"
echo ""
echo "Optional modes:"
echo "  export MEMSY_SESSION_AUTOCONTEXT=on  # surface recent memories at session start"
echo ""
echo "Verify: ask your agent 'What do we know about X?' to test recall."
echo "Docs: https://memsy.io/docs/openclaw"
