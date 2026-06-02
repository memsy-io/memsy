#!/usr/bin/env bash
# Install Memsy into a NanoClaw fork.
#
# Usage:
#   ./install.sh /path/to/nanoclaw-fork
#
# What this does:
#   1. Copies container skills (memsy-recall, memsy-remember) into the fork
#   2. Copies the add-memsy operational skill
#   3. Optionally installs the host-side turn-sync module (MEMSY_TURN_SYNC=on)
#
# After running, follow the prompts in NanoClaw to complete MCP server setup:
#   /add-memsy   (in Claude Code inside NanoClaw)
#
# Or manually:
#   ncl groups config add-mcp-server --group <name> --name memsy \
#     --command npx --args '["-y","@memsy-io/mcp"]' \
#     --env "MEMSY_API_KEY=<your-key>"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: ./install.sh /path/to/nanoclaw-fork"
  echo ""
  echo "Example: ./install.sh ~/projects/my-nanoclaw"
  exit 1
fi

if [[ ! -d "$TARGET/container/skills" ]]; then
  echo "Error: $TARGET does not look like a NanoClaw fork (missing container/skills/)."
  exit 1
fi

# ── 1. Container skills ───────────────────────────────────────────────────────
echo "Installing container skills..."
cp -r "${SCRIPT_DIR}/container/skills/memsy-recall"   "${TARGET}/container/skills/"
cp -r "${SCRIPT_DIR}/container/skills/memsy-remember" "${TARGET}/container/skills/"
echo "✓ memsy-recall and memsy-remember installed to container/skills/"

# ── 2. Operational skill ──────────────────────────────────────────────────────
mkdir -p "${TARGET}/.claude/skills"
cp -r "${SCRIPT_DIR}/skills/add-memsy" "${TARGET}/.claude/skills/"
echo "✓ add-memsy skill installed — run /add-memsy in Claude Code to complete setup"

# ── 3. Turn sync (optional) ───────────────────────────────────────────────────
echo ""
read -r -p "Install host-side turn sync module? (enables MEMSY_TURN_SYNC=on) [y/N] " yn
if [[ "${yn,,}" == "y" ]]; then
  # Container skill
  cp -r "${SCRIPT_DIR}/container/skills/memsy-turn-sync" "${TARGET}/container/skills/"
  echo "✓ memsy-turn-sync container skill installed"

  # Host module
  mkdir -p "${TARGET}/src/modules/memsy"
  cp "${SCRIPT_DIR}/src/modules/memsy/index.ts" "${TARGET}/src/modules/memsy/"
  echo "✓ src/modules/memsy/index.ts installed"

  # Patch modules barrel
  BARREL="${TARGET}/src/modules/index.ts"
  if [[ -f "$BARREL" ]]; then
    if grep -q "memsy" "$BARREL"; then
      echo "  memsy import already in modules barrel — skipping"
    else
      echo "" >> "$BARREL"
      echo "import './memsy/index.js';" >> "$BARREL"
      echo "✓ Appended memsy import to src/modules/index.ts"
    fi
  else
    echo "⚠ Could not find src/modules/index.ts — add this line manually:"
    echo "    import './memsy/index.js';"
  fi

  # .env entry
  ENV_FILE="${TARGET}/.env"
  if [[ -f "$ENV_FILE" ]]; then
    if grep -q "MEMSY_TURN_SYNC" "$ENV_FILE"; then
      echo "  MEMSY_TURN_SYNC already in .env — skipping"
    else
      echo "" >> "$ENV_FILE"
      echo "# Memsy turn sync — set to on to capture every conversation turn" >> "$ENV_FILE"
      echo "MEMSY_TURN_SYNC=off" >> "$ENV_FILE"
      echo "✓ Added MEMSY_TURN_SYNC=off to .env (set to on to enable)"
    fi
  fi

  echo ""
  echo "Turn sync installed. To activate:"
  echo "  1. Set MEMSY_TURN_SYNC=on in .env"
  echo "  2. pnpm build"
  echo "  3. Restart NanoClaw"
fi

# ── 4. .env.example ───────────────────────────────────────────────────────────
ENV_EXAMPLE="${TARGET}/.env.example"
if [[ -f "$ENV_EXAMPLE" ]] && ! grep -q "MEMSY_API_KEY" "$ENV_EXAMPLE"; then
  echo "" >> "$ENV_EXAMPLE"
  echo "# Memsy long-term memory" >> "$ENV_EXAMPLE"
  echo "MEMSY_API_KEY=msy_..." >> "$ENV_EXAMPLE"
  echo "MEMSY_TURN_SYNC=off" >> "$ENV_EXAMPLE"
  echo "✓ Added Memsy vars to .env.example"
fi

# ── 5. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "Memsy installed into ${TARGET}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Add your API key to .env:"
echo "       MEMSY_API_KEY=msy_..."
echo "       (Get one at https://app.memsy.io → Settings → API Keys)"
echo ""
echo "  2. Register the MCP server for each agent group:"
echo "       ncl groups config add-mcp-server \\"
echo "         --group <group-name> \\"
echo "         --name memsy \\"
echo "         --command npx \\"
echo "         --args \"-y,@memsy-io/mcp\" \\"
echo "         --env \"MEMSY_API_KEY=\${MEMSY_API_KEY}\""
echo ""
echo "  3. Restart NanoClaw and test:"
echo "       \"Remember that we use Postgres for billing\""
echo "       \"What did we decide about billing?\""
echo ""
echo "Docs: https://memsy.io/docs/nanoclaw"
