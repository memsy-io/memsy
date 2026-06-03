#!/usr/bin/env bash
# Install Memsy into a NanoClaw fork.
#
# Usage:
#   ./install.sh /path/to/nanoclaw-fork
#
# Memory model: TURN SYNC (automatic, host-side).
#   - User messages captured in src/router.ts
#   - Assistant messages captured in src/delivery.ts
#   - Both via the shared src/memsy-sync.ts helper
#   - The agent must NOT call memsy_ingest (turn sync handles it) — we set
#     MEMSY_DISABLED_TOOLS=memsy_ingest and do not install a memsy-remember skill.
#
# This copies the helper + recall skill + the add-memsy guide, then prints the
# two host hooks to add. Patching core files (router.ts/delivery.ts) is left
# explicit rather than auto-edited so a NanoClaw upgrade can't silently break it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: ./install.sh /path/to/nanoclaw-fork"
  exit 1
fi
if [[ ! -d "$TARGET/src" || ! -d "$TARGET/container/skills" ]]; then
  echo "Error: $TARGET does not look like a NanoClaw fork (missing src/ or container/skills/)."
  exit 1
fi

# ── 1. Shared turn-sync helper ────────────────────────────────────────────────
cp "${SCRIPT_DIR}/src/memsy-sync.ts" "${TARGET}/src/memsy-sync.ts"
echo "✓ src/memsy-sync.ts installed (shared ingest helper)"

# ── 2. Recall skill (NOT memsy-remember — turn sync handles capture) ──────────
cp -r "${SCRIPT_DIR}/container/skills/memsy-recall" "${TARGET}/container/skills/"
echo "✓ memsy-recall skill installed"

# ── 3. Operational guide ──────────────────────────────────────────────────────
mkdir -p "${TARGET}/.claude/skills"
cp -r "${SCRIPT_DIR}/skills/add-memsy" "${TARGET}/.claude/skills/"
echo "✓ add-memsy guide installed (run /add-memsy in Claude Code for guided setup)"

# ── 4. .env scaffolding ───────────────────────────────────────────────────────
ENV_EXAMPLE="${TARGET}/.env.example"
if [[ -f "$ENV_EXAMPLE" ]] && ! grep -q "MEMSY_API_KEY" "$ENV_EXAMPLE"; then
  {
    echo ""
    echo "# Memsy long-term memory"
    echo "MEMSY_API_KEY=msy_..."
    echo "MEMSY_ACTOR_ID=your-username   # required: containers can't derive an identity"
    echo "MEMSY_TURN_SYNC=on            # capture every turn automatically"
  } >> "$ENV_EXAMPLE"
  echo "✓ Added Memsy vars to .env.example"
fi

# ── 5. Next steps ─────────────────────────────────────────────────────────────
cat <<'EOF'

Memsy files installed. To finish (or run /add-memsy in Claude Code to do it for you):

1. Add to .env:
     MEMSY_API_KEY=msy_...
     MEMSY_ACTOR_ID=your-username
     MEMSY_TURN_SYNC=on

2. Add the user-message hook to src/router.ts — after the "Message routed"
   log in the routing function:

     import { memsyIngest } from './memsy-sync.js';   // top of file
     // ...after writeSessionMessage + the 'Message routed' log:
     if (event.message.kind === 'chat' || event.message.kind === 'chat-sdk') {
       memsyIngest('user_message', event.message.content, session.id).catch(() => {});
     }

3. Add the assistant-message hook to src/delivery.ts — after the
   "Message delivered" log in deliverMessage:

     import { memsyIngest } from './memsy-sync.js';   // top of file
     // ...after the 'Message delivered' log:
     if (msg.kind === 'chat') {
       memsyIngest('assistant_message', msg.content, session.id).catch(() => {});
     }

4. Register the MCP server per agent group (use --id from: ncl groups list).
   MEMSY_DISABLED_TOOLS=memsy_ingest stops the agent double-writing:

     ncl groups config add-mcp-server \
       --id <group-id> \
       --name memsy \
       --command npx \
       --args '["-y","@memsy-io/mcp"]' \
       --env '{"MEMSY_API_KEY":"msy_...","MEMSY_ACTOR_ID":"your-username","MEMSY_DISABLED_TOOLS":"memsy_ingest"}'

5. Build and restart the host:
     pnpm build
     # restart your NanoClaw host process

Verify: send a message in any channel, then ask "what do you know about me?".
Logs should show: Memsy turn synced kind=user_message status=200
                  Memsy turn synced kind=assistant_message status=200

Docs: https://memsy.io/docs/nanoclaw
EOF
