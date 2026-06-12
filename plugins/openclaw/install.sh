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
# tools.profile (local onboarding defaults it to "coding") is a base ALLOWLIST
# applied BEFORE tools.allow/tools.deny — and tools.allow can only NARROW what
# survived the profile, never re-add (policy order: profile → allow/deny;
# verified empirically: with profile "coding" even allow:["*"] still strips
# plugin-owned tools). So plugin tools require either profile "full" (with
# allow acting as the allowlist) or no profile.
#
# When the config is the untouched onboarding default (profile "coding", no
# allow list) we convert it losslessly: profile → "full" plus an allow list
# replicating coding's documented contents + "memsy_*". Anything else is the
# user's own policy — print instructions instead of clobbering it.
# NOTE: the group list mirrors the "coding" profile as of OpenClaw 2026.6.x.
CODING_EQUIV='["group:fs","group:runtime","group:web","group:sessions","group:memory","cron","image","image_generate","skill_workshop","video_generate","memsy_*"]'
PROFILE="$(openclaw config get tools.profile 2>/dev/null | tail -n1 || true)"
ALLOW_JSON="$(openclaw config get tools.allow 2>/dev/null || true)"
allow_has_memsy() { printf '%s' "$ALLOW_JSON" | grep -q 'memsy_\*'; }
allow_is_set()    { printf '%s' "$ALLOW_JSON" | grep -q '\['; }
case "$PROFILE" in
  ""|full|*"not found"*)
    if allow_is_set && ! allow_has_memsy; then
      echo "⚠ tools.allow is set but doesn't include \"memsy_*\" — the agent won't see the Memsy tools."
      echo "  Append it to your existing entries:"
      echo "    openclaw config set tools.allow '[...your entries..., \"memsy_*\"]' --strict-json"
    fi
    ;;
  coding)
    if allow_is_set; then
      # The user manages their own allow list — never clobber it. (Even if it
      # already names memsy_*, the coding profile strips the tools first, so
      # the profile must still be switched.)
      echo "⚠ tools.profile \"coding\" filters out plugin tools and tools.allow cannot re-add them."
      echo "  Switch to profile \"full\" with an allow list (keep your entries, add coding's groups + memsy_*):"
      echo "    openclaw config set tools.profile full"
      echo "    openclaw config set tools.allow '${CODING_EQUIV}' --strict-json"
    else
      echo "Exposing Memsy tools (profile \"coding\" filters plugin-owned tools; converting to"
      echo "profile \"full\" + an equivalent allow list — same toolset, plus memsy_*)..."
      if openclaw config set tools.allow "$CODING_EQUIV" --strict-json >/dev/null 2>&1 \
         && openclaw config set tools.profile full >/dev/null 2>&1; then
        echo "✓ tools.profile=full, tools.allow=coding-equivalent + \"memsy_*\"."
      else
        echo "⚠ Could not update tool policy automatically. Run:"
        echo "    openclaw config set tools.profile full"
        echo "    openclaw config set tools.allow '${CODING_EQUIV}' --strict-json"
      fi
    fi
    ;;
  *)
    echo "⚠ tools.profile is \"${PROFILE}\", which filters out plugin-owned tools, and tools.allow"
    echo "  cannot re-add them. To expose the Memsy tools, switch to an explicit allow list:"
    echo "    openclaw config set tools.profile full"
    echo "    openclaw config set tools.allow '[...the tools you use..., \"memsy_*\"]' --strict-json"
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
echo "Start OpenClaw (local terminal UI):"
echo "  openclaw chat"
echo "Gateway already running? Reload plugins with:"
echo "  openclaw gateway restart"
echo "(A TUI session that was open during install must be fully exited and"
echo " relaunched — plugins and tool policy load at process startup.)"
echo ""
echo "Optional: enable auto-context (injects recent memories at session start):"
echo "  openclaw config set plugins.entries.memsy.config.sessionAutoContext true --strict-json"
echo "Or proactive capture (auto-store decisions/preferences):"
echo "  openclaw config set plugins.entries.memsy.config.proactive true --strict-json"
echo ""
echo "Verify: ask your agent 'What do we know about X?' to test recall."
echo "Docs: https://docs.memsy.io/docs/openclaw"
