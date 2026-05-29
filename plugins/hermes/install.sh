#!/usr/bin/env bash
# Install Memsy integration for Hermes Agent (NousResearch).
# Usage: ./install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="${HOME}/.hermes"
HERMES_CONFIG="${HERMES_DIR}/config.yaml"
HERMES_PLUGINS_DIR="${HERMES_DIR}/plugins"

# ── 1. Pre-flight checks ──────────────────────────────────────────────────────
if ! command -v hermes &>/dev/null; then
  echo "Error: hermes CLI not found."
  echo "Install: https://hermes-agent.nousresearch.com/docs/getting-started/quickstart"
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  echo "Error: python3 is required for this installer."
  exit 1
fi

mkdir -p "${HERMES_DIR}" "${HERMES_PLUGINS_DIR}"

if [[ ! -f "${HERMES_CONFIG}" ]]; then
  touch "${HERMES_CONFIG}"
fi

# ── 2. Install Python plugin ──────────────────────────────────────────────────
# Copies memsy_hermes_plugin/ into ~/.hermes/plugins/memsy/ so Hermes discovers
# it on startup. This is the manual install path; pip install is also available.
PLUGIN_SRC="${SCRIPT_DIR}/memsy_hermes_plugin"
PLUGIN_DST="${HERMES_PLUGINS_DIR}/memsy"

if [[ -d "${PLUGIN_DST}" ]]; then
  echo "  Updating existing plugin at ${PLUGIN_DST}"
  rm -rf "${PLUGIN_DST}"
fi

cp -r "${PLUGIN_SRC}" "${PLUGIN_DST}"
echo "✓ Plugin installed to ${PLUGIN_DST}"

# ── 3. Update config.yaml ─────────────────────────────────────────────────────
# Expands MEMSY_API_KEY at install time so Hermes gets the real value.
# If MEMSY_API_KEY is not set, the env block is omitted and Hermes inherits
# the key from the shell environment when it starts the MCP subprocess.
MEMSY_API_KEY_VAL="${MEMSY_API_KEY:-}"

python3 - "${HERMES_CONFIG}" "${MEMSY_API_KEY_VAL}" <<'PY'
import re, sys

config_path = sys.argv[1]
api_key = sys.argv[2]  # expanded at install time, not a shell ${} reference

with open(config_path) as f:
    content = f.read()

# ── MCP server block ──────────────────────────────────────────────────────────
if api_key:
    memsy_block = (
        "  memsy:\n"
        "    command: npx\n"
        "    args: [\"-y\", \"@memsy-io/mcp\"]\n"
        "    enabled: true\n"
        "    env:\n"
        f"      MEMSY_API_KEY: \"{api_key}\"\n"
    )
else:
    memsy_block = (
        "  memsy:\n"
        "    command: npx\n"
        "    args: [\"-y\", \"@memsy-io/mcp\"]\n"
        "    enabled: true\n"
    )

already_has_memsy = bool(re.search(r"^\s+memsy\s*:", content, re.MULTILINE))

if already_has_memsy:
    print("  memsy MCP server already present — skipping.")
elif re.search(r"^mcp_servers\s*:", content, re.MULTILINE):
    content = re.sub(
        r"(^mcp_servers\s*:\s*\n)",
        r"\1" + memsy_block,
        content, count=1, flags=re.MULTILINE,
    )
    print("✓ Added memsy under existing mcp_servers:")
else:
    content += "\nmcp_servers:\n" + memsy_block
    print("✓ Added mcp_servers.memsy to config.yaml")

# ── plugins.enabled ───────────────────────────────────────────────────────────
already_enabled = bool(re.search(r"^\s+-\s+memsy\s*$", content, re.MULTILINE))

if already_enabled:
    print("  memsy already in plugins.enabled — skipping.")
elif re.search(r"^\s+enabled\s*:", content, re.MULTILINE):
    content = re.sub(
        r"(^\s+enabled\s*:\s*\n)",
        r"\1    - memsy\n",
        content, count=1, flags=re.MULTILINE,
    )
    print("✓ Added memsy to plugins.enabled")
elif re.search(r"^plugins\s*:", content, re.MULTILINE):
    content = re.sub(
        r"(^plugins\s*:\s*\n)",
        r"\1  enabled:\n    - memsy\n",
        content, count=1, flags=re.MULTILINE,
    )
    print("✓ Added memsy to plugins.enabled")
else:
    content += "\nplugins:\n  enabled:\n    - memsy\n"
    print("✓ Added plugins.enabled: [memsy] to config.yaml")

with open(config_path, "w") as f:
    f.write(content)
PY

# ── 4. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "Memsy for Hermes installed."
echo ""
if [[ -z "${MEMSY_API_KEY:-}" ]]; then
  echo "⚠ MEMSY_API_KEY not set. Set it before starting Hermes:"
  echo "  export MEMSY_API_KEY=msy_..."
else
  echo "✓ MEMSY_API_KEY written to MCP server config."
fi
echo ""
echo "Start Hermes:"
echo "  hermes chat"
echo ""
echo "Optional modes (set before starting Hermes):"
echo "  export MEMSY_SESSION_AUTOCONTEXT=on    # inject recent memories at session start"
echo "  export MEMSY_SESSION_CONTEXT_LIMIT=6   # how many memories (default 6, max 20)"
echo ""
echo "After config changes, reload MCP without restarting:"
echo "  /reload-mcp"
echo ""
echo "Verify plugins: hermes plugins list"
echo "Verify MCP: ask 'What do we know about X?' to test recall."
echo "Docs: https://memsy.io/docs/hermes"
