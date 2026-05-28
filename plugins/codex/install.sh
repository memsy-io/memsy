#!/usr/bin/env bash
# Install Memsy integration for OpenAI Codex CLI.
# Usage:
#   ./install.sh          # Register MCP + install skills globally
#   ./install.sh --project # Also append AGENTS.md.snippet to ./AGENTS.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_MODE=false
[[ "${1:-}" == "--project" ]] && PROJECT_MODE=true

# ── 1. Verify codex is installed ──────────────────────────────────────────────
if ! command -v codex &>/dev/null; then
  echo "Error: codex CLI not found."
  echo "Install: npm install -g @openai/codex"
  echo "Docs: https://developers.openai.com/codex"
  exit 1
fi

# ── 2. Register MCP server ────────────────────────────────────────────────────
CODEX_CONFIG="${HOME}/.codex/config.toml"
mkdir -p "${HOME}/.codex"

if grep -q '^\[mcp_servers\.memsy\]' "${CODEX_CONFIG}" 2>/dev/null; then
  echo "  [mcp_servers.memsy] already present in ${CODEX_CONFIG}"
else
  cat >> "${CODEX_CONFIG}" <<'TOML'

[mcp_servers.memsy]
command = "npx"
args = ["-y", "@memsy-io/mcp"]
TOML
  echo "✓ Added [mcp_servers.memsy] to ${CODEX_CONFIG}"
fi

# ── 3. Install skills ─────────────────────────────────────────────────────────
SKILL_DIR="${HOME}/.codex/skills"
for skill in memsy-recall memsy-remember; do
  src="${SCRIPT_DIR}/skills/${skill}/SKILL.md"
  dst="${SKILL_DIR}/${skill}/SKILL.md"
  if [[ -f "${src}" ]]; then
    mkdir -p "${SKILL_DIR}/${skill}"
    cp "${src}" "${dst}"
    echo "✓ Installed skill: ${skill}"
  fi
done

# ── 4. Optionally append AGENTS.md ────────────────────────────────────────────
if [[ "${PROJECT_MODE}" == true ]]; then
  AGENTS_MD="${PWD}/AGENTS.md"
  SNIPPET="${SCRIPT_DIR}/AGENTS.md.snippet"
  if grep -q "Memsy" "${AGENTS_MD}" 2>/dev/null; then
    echo "  AGENTS.md already contains Memsy section — skipping."
  else
    echo "" >> "${AGENTS_MD}"
    cat "${SNIPPET}" >> "${AGENTS_MD}"
    echo "✓ Appended Memsy section to ${AGENTS_MD}"
  fi
fi

# ── 5. Verify ─────────────────────────────────────────────────────────────────
echo ""
echo "Memsy for Codex installed."
echo ""
echo "Verify:"
echo "  1. Set MEMSY_API_KEY in the MCP env block (shell env is not inherited):"
echo "     Edit ~/.codex/config.toml and add:"
echo "       [mcp_servers.memsy.env]"
echo "       MEMSY_API_KEY = \"msy_...\""
echo ""
echo "  2. Start codex, then type: /skills → select memsy-recall to test recall."
echo "     Or ask: 'what did we decide about X?' to trigger it naturally."
echo ""
echo "  Docs: https://memsy.io/docs/codex"
