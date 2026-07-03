#!/usr/bin/env bash
# Install Memsy as a native memory provider for Hermes Agent (NousResearch).
# Usage: ./install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="${HOME}/.hermes"
HERMES_CONFIG="${HERMES_DIR}/config.yaml"
# Hermes scans $HERMES_HOME/plugins/<name>/ DIRECTLY for user-installed memory
# providers (it descends into each child and detects MemoryProvider via a text
# heuristic) — NOT plugins/memory/<name>/. The plugins/memory/<name>/ layout in
# the docs is the BUNDLED location inside the hermes-agent repo. Confirmed in
# the installed loader: plugins/memory/__init__.py:_get_user_plugins_dir() →
# get_hermes_home()/"plugins", iterated flat. Installing under a memory/ subdir
# leaves the provider undiscovered.
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

# ── 2. Install memory provider ────────────────────────────────────────────────
# Copies memory_provider/ into ~/.hermes/plugins/memsy/ — the directory Hermes
# scans for user-installed memory provider plugins.
PROVIDER_SRC="${SCRIPT_DIR}/memory_provider"
PROVIDER_DST="${HERMES_PLUGINS_DIR}/memsy"

if [[ -d "${PROVIDER_DST}" ]]; then
  echo "  Updating existing provider at ${PROVIDER_DST}"
  rm -rf "${PROVIDER_DST}"
fi

cp -r "${PROVIDER_SRC}" "${PROVIDER_DST}"
# The spec's provider layout includes README.md (setup instructions) alongside
# __init__.py/plugin.yaml/cli.py — ship it into the installed provider dir.
cp "${SCRIPT_DIR}/README.md" "${PROVIDER_DST}/README.md"
echo "✓ Memory provider installed to ${PROVIDER_DST}"

# ── 2b. Remove stale installs from old paths ──────────────────────────────────
# Earlier installers wrongly nested the provider under plugins/memory/memsy,
# where Hermes never scans. Clean it up so discovery isn't confused.
if [[ -d "${HERMES_DIR}/plugins/memory/memsy" ]]; then
  rm -rf "${HERMES_DIR}/plugins/memory/memsy"
  rmdir "${HERMES_DIR}/plugins/memory" 2>/dev/null || true
  echo "  Removed stale install at ${HERMES_DIR}/plugins/memory/memsy"
fi

# ── 3. Update config.yaml ─────────────────────────────────────────────────────
python3 - "${HERMES_CONFIG}" <<'PY'
import re, sys

config_path = sys.argv[1]

with open(config_path) as f:
    content = f.read()

# ── memory.provider ───────────────────────────────────────────────────────────
already_has_provider = bool(re.search(r"^\s+provider\s*:\s*memsy", content, re.MULTILINE))

if already_has_provider:
    print("  memory.provider: memsy already set — skipping.")
elif re.search(r"^memory\s*:\s*\n", content, re.MULTILINE):
    content = re.sub(
        r"(^memory\s*:\s*\n)",
        r"\1  provider: memsy\n",
        content, count=1, flags=re.MULTILINE,
    )
    print("✓ Set memory.provider: memsy in existing memory: block")
elif re.search(r"^memory\s*:", content, re.MULTILINE):
    content = re.sub(
        r"^memory\s*:.*",
        "memory:\n  provider: memsy",
        content, count=1, flags=re.MULTILINE,
    )
    print("✓ Replaced memory: line with provider block")
else:
    content += "\nmemory:\n  provider: memsy\n"
    print("✓ Added memory.provider: memsy to config.yaml")

with open(config_path, "w") as f:
    f.write(content)
PY

# ── 4. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "Memsy memory provider installed."
echo ""
if [[ -z "${MEMSY_API_KEY:-}" ]]; then
  echo "⚠ MEMSY_API_KEY not set. Configure it before starting Hermes:"
  echo ""
  echo "  Option 1 — environment variable (add to ~/.zshrc or ~/.bashrc):"
  echo "    export MEMSY_API_KEY=msy_..."
  echo ""
  echo "  Option 2 — interactive setup (saves to ~/.hermes/.env):"
  echo "    hermes memory setup"
  echo ""
else
  echo "✓ MEMSY_API_KEY is set."
  echo ""
fi
echo "Start Hermes:"
echo "  hermes chat"
echo ""
echo "Installed:"
echo "  Memory provider : ${PROVIDER_DST}"
echo "  Config          : memory.provider: memsy in ${HERMES_CONFIG}"
echo ""
echo "Verify:"
echo "  hermes memsy status     — check Memsy connectivity"
echo "  hermes memory setup     — reconfigure API key interactively"
echo ""
echo "Docs: https://docs.memsy.io/docs/hermes"
