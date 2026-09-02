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

# Idempotent: re-running install.sh is the documented way to (re)enter the key
# prompt below, so a marketplace/plugin that already exists must NOT abort the
# script under `set -e`. `codex plugin marketplace upgrade` refreshes an
# existing snapshot; `plugin add` is re-run either way to pick up changes.
echo "Adding Memsy marketplace to Codex..."
if ! codex plugin marketplace add memsy-io/memsy 2>/dev/null; then
  echo "  (marketplace already configured — refreshing)"
  codex plugin marketplace upgrade memsy >/dev/null 2>&1 || true
fi

echo "Installing Memsy plugin..."
# `codex plugin add` only exists on newer Codex CLIs (v0.125+); older ones have
# only `codex plugin marketplace` and install via the /plugins browser inside
# Codex. Feature-detect instead of assuming — and never claim success unless
# `codex plugin list` actually reports the plugin installed.
_plugin_installed() {
  codex plugin list 2>/dev/null | grep -E '^memsy@memsy[[:space:]]' | grep -qv 'not installed'
}

PLUGIN_OK=0
if codex plugin --help 2>/dev/null | grep -qE '^[[:space:]]+add[[:space:]]'; then
  codex plugin add memsy@memsy || true
  if _plugin_installed; then
    PLUGIN_OK=1
  fi
else
  echo "⚠ This Codex version has no 'codex plugin add' subcommand (added around v0.125)."
fi

echo ""
if [[ "$PLUGIN_OK" == 1 ]]; then
  echo "Memsy for Codex installed."
else
  echo "⚠ Memsy plugin is NOT installed yet. Finish the install one of two ways:"
  echo "    1. Update Codex, then re-run this script:"
  echo "         npm install -g @openai/codex@latest"
  echo "    2. Or install interactively: start codex, run /plugins, open the"
  echo "       'memsy' marketplace, select 'memsy', and choose Install plugin."
fi
echo ""

# ── Interactive API key setup ─────────────────────────────────────────────────
# Codex does not pass your shell environment to MCP servers, so `export
# MEMSY_API_KEY=...` alone may not reach the server. The MCP DOES read its own
# config file, so we persist the key to ~/.memsy/config.json (the active
# profile's api_key) — the server reads it from disk on launch, and the same
# file is shared with every other MCP host (Cursor, Cline, …). Auto-skips when a
# key is already saved, in non-interactive shells (CI), or without python3.
MEMSY_CONFIG="${HOME}/.memsy/config.json"

_memsy_manual_key_help() {
  echo "  To set it: re-run ./install.sh, or add it to ~/.codex/config.toml —"
  echo "    [mcp_servers.memsy.env]"
  echo "    MEMSY_API_KEY = \"msy_...\""
}

if ! command -v python3 &>/dev/null || [[ ! -t 0 ]]; then
  echo "Set your Memsy API key so the MCP can authenticate."
  _memsy_manual_key_help
else
  saved_key="$(MEMSY_CONFIG="$MEMSY_CONFIG" python3 - <<'PY' 2>/dev/null
import json, os
try:
    cfg = json.load(open(os.environ["MEMSY_CONFIG"]))
except Exception:
    cfg = {}
profs = cfg.get("profiles") if isinstance(cfg, dict) else None
active = cfg.get("active_profile") if isinstance(cfg, dict) and isinstance(cfg.get("active_profile"), str) and cfg.get("active_profile") else "default"
prof = profs.get(active) if isinstance(profs, dict) else (cfg if isinstance(cfg, dict) else {})
print((prof or {}).get("api_key", "") if isinstance(prof, dict) else "")
PY
)" || saved_key=""

  if [[ -n "$saved_key" ]]; then
    echo "✓ Memsy API key already saved in ${MEMSY_CONFIG} — the MCP reads it from there."
  else
    if [[ -n "${MEMSY_API_KEY:-}" ]]; then
      printf "Found MEMSY_API_KEY in your environment. Save it to %s so Codex's MCP can read it? [Y/n] " "$MEMSY_CONFIG"
      read -r _ans || _ans=""
      if [[ "$_ans" =~ ^[Nn] ]]; then _key=""; else _key="$MEMSY_API_KEY"; fi
    else
      printf "Enter your Memsy API key (msy_...) to save it now, or press Enter to skip: "
      read -rs _key || _key=""   # -s: don't echo the key to the terminal
      printf '\n'                # read -s swallows the newline; restore it
    fi
    if [[ -n "${_key// /}" ]]; then
      if MEMSY_CONFIG="$MEMSY_CONFIG" MEMSY_KEY_INPUT="$_key" python3 - <<'PY'
import json, os
path = os.environ["MEMSY_CONFIG"]
key = os.environ["MEMSY_KEY_INPUT"].strip()
os.makedirs(os.path.dirname(path), exist_ok=True)
try:
    cfg = json.load(open(path))
    if not isinstance(cfg, dict):
        cfg = {}
except Exception:
    cfg = {}
profs = cfg.get("profiles")
if not isinstance(profs, dict):
    profs = {}
active = cfg.get("active_profile") if isinstance(cfg.get("active_profile"), str) and cfg.get("active_profile") else "default"
prof = profs.get(active)
if not isinstance(prof, dict):
    prof = {}
prof["api_key"] = key
profs[active] = prof
cfg["profiles"] = profs
cfg["active_profile"] = active
# Atomic write + 0600 (the file holds an API key).
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(cfg, f, indent=2)
os.chmod(tmp, 0o600)
os.replace(tmp, path)
PY
      then
        echo "✓ API key saved to ${MEMSY_CONFIG} (chmod 600). The MCP reads it from there — no export needed."
      else
        echo "⚠ Could not write ${MEMSY_CONFIG}."
        _memsy_manual_key_help
      fi
    else
      echo "  Skipped."
      _memsy_manual_key_help
    fi
  fi
fi
echo ""
echo "Optional modes (set before starting Codex):"
echo "  export MEMSY_SESSION_AUTOCONTEXT=on   # surface recent memories at session start"
echo "  export MEMSY_TURN_SYNC=on             # store EVERY turn (user + assistant)"
echo "  export MEMSY_PROACTIVE=on             # store only the important ones automatically"
echo "  export MEMSY_CONFIRM_STORE=on         # ask before storing"
echo ""
echo "Verify: start codex, then ask 'What do we know about X?' to test recall."
echo "Docs: https://docs.memsy.io/docs/codex"
