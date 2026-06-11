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
# Install from an npm pack tarball, NOT the loose dist/index.js: the tarball
# carries openclaw.plugin.json alongside the build, so OpenClaw extracts the
# whole plugin into ~/.openclaw/extensions/memsy/ with the manifest in place.
# (A loose-file install lands index.js directly in extensions/ with no
# manifest, which OpenClaw 2026.6.x rejects at config validation.)
OPENCLAW_HOME="${OPENCLAW_HOME:-${HOME}/.openclaw}"

echo "Installing plugin..."
TGZ="$(npm pack --silent | tail -n1)"
openclaw plugins install --force "${SCRIPT_DIR}/${TGZ}"
rm -f "${SCRIPT_DIR}/${TGZ}"
echo "✓ Plugin installed."

# ── Tool policy ───────────────────────────────────────────────────────────────
# tools.profile (local onboarding defaults it to "coding") is a base ALLOWLIST:
# plugin-owned tools are filtered out of the agent's toolset unless explicitly
# allowed. Without this, the plugin loads fine but the agent never sees the
# memsy_* tools. When an allow list already exists we never clobber it — we
# print the merge instruction instead.
PROFILE="$(openclaw config get tools.profile 2>/dev/null | tail -n1 || true)"
case "$PROFILE" in
  ""|full|*"not found"*)
    : # no profile restriction — plugin tools are visible as-is
    ;;
  *)
    ALLOW_JSON="$(openclaw config get tools.allow 2>/dev/null || true)"
    if printf '%s' "$ALLOW_JSON" | grep -q 'memsy_\*'; then
      echo "✓ tools.allow already includes \"memsy_*\"."
    elif printf '%s' "$ALLOW_JSON" | grep -q '\['; then
      echo "⚠ tools.profile is \"${PROFILE}\" (an allowlist) and tools.allow doesn't include \"memsy_*\"."
      echo "  The agent won't see the Memsy tools until you add it (keep your existing entries):"
      echo "    openclaw config set tools.allow '[\"memsy_*\", ...your existing entries...]' --strict-json"
    else
      echo "Allowing Memsy tools (tools.profile \"${PROFILE}\" filters out plugin tools)..."
      if openclaw config set tools.allow '["memsy_*"]' --strict-json >/dev/null 2>&1; then
        echo "✓ Added \"memsy_*\" to tools.allow."
      else
        echo "⚠ Could not update tools.allow automatically. Add it yourself:"
        echo "    openclaw config set tools.allow '[\"memsy_*\"]' --strict-json"
      fi
    fi
    ;;
esac

# ── Install skills ────────────────────────────────────────────────────────────
echo "Installing skills..."
openclaw skills install --global --force --as memsy-recall   "${SCRIPT_DIR}/skills/memsy-recall"
openclaw skills install --global --force --as memsy-remember "${SCRIPT_DIR}/skills/memsy-remember"
echo "✓ Skills installed."

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Memsy for OpenClaw installed."
echo ""
# ── Interactive API key setup ─────────────────────────────────────────────────
# OpenClaw loads ~/.openclaw/.env into the environment on every start (the docs'
# recommended trusted source for credentials), and the plugin reads
# MEMSY_API_KEY from there. Offer to append it. For a secrets manager (1Password,
# Vault, …) point at OpenClaw's native `openclaw secrets configure`. Auto-skips
# when the key is already set, already in .env, or in a non-interactive shell.
ENV_FILE="${OPENCLAW_HOME}/.env"
if [[ -n "${MEMSY_API_KEY:-}" ]]; then
  echo "✓ MEMSY_API_KEY is set in your environment."
  echo "  To persist it across restarts:  echo \"MEMSY_API_KEY=\$MEMSY_API_KEY\" >> ${ENV_FILE}"
elif [[ -f "$ENV_FILE" ]] && grep -q '^MEMSY_API_KEY=' "$ENV_FILE" 2>/dev/null; then
  echo "✓ MEMSY_API_KEY already set in ${ENV_FILE} — OpenClaw loads it on every start."
elif [[ ! -t 0 ]]; then
  echo "Set your Memsy API key (recommended):  echo 'MEMSY_API_KEY=msy_...' >> ${ENV_FILE}"
  echo "Or run OpenClaw's interactive helper:  openclaw secrets configure"
else
  printf "Enter your Memsy API key (msy_..., from https://app.memsy.io) to save it to %s, or press Enter to skip: " "$ENV_FILE"
  read -rs _key || _key=""   # -s: don't echo the key to the terminal
  printf '\n'                # read -s swallows the newline; restore it
  if [[ -n "${_key// /}" ]]; then
    mkdir -p "${OPENCLAW_HOME}"
    # Lock perms BEFORE the key lands in the file: a freshly created .env would
    # otherwise carry default-umask perms for the instant between append and
    # chmod. Append (not rewrite) — .env can hold other variables.
    touch "$ENV_FILE" && chmod 600 "$ENV_FILE" 2>/dev/null || true
    printf 'MEMSY_API_KEY=%s\n' "$_key" >> "$ENV_FILE"
    echo "✓ Appended MEMSY_API_KEY to ${ENV_FILE} — OpenClaw loads it on every start."
  else
    echo "  Skipped. Add it later:  echo 'MEMSY_API_KEY=msy_...' >> ${ENV_FILE}"
    echo "  Or run the interactive helper (1Password / Vault / … via SecretRef):  openclaw secrets configure"
  fi
fi
echo ""
echo "Start OpenClaw:"
echo "  openclaw start"
echo "Already running? Reload plugins with:"
echo "  openclaw gateway restart"
echo ""
echo "Optional: enable auto-context (injects recent memories at session start):"
echo "  export MEMSY_SESSION_AUTOCONTEXT=on"
echo ""
echo "Verify: ask your agent 'What do we know about X?' to test recall."
echo "Docs: https://docs.memsy.io/docs/openclaw"
