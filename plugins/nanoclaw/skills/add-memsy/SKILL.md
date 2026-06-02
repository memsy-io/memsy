---
name: add-memsy
description: Install Memsy long-term memory into a NanoClaw instance. Run when the user wants to add persistent memory, recall past decisions across channels, or enable turn-by-turn memory sync. Guides through MCP server registration, container skill deployment, and optional turn sync setup.
---

Install Memsy into NanoClaw. Work through these phases:

## Phase 1 — Pre-flight

Check prerequisites:

1. Verify `ncl` CLI is available: `ncl --version`
2. Check `MEMSY_API_KEY` is set: `echo ${MEMSY_API_KEY:-NOT SET}`
3. If not set, ask the user:

```
AskUserQuestion: "What is your Memsy API key? Get one at https://app.memsy.io → Settings → API Keys"
```

4. Confirm at least one agent group exists: `ncl groups list`

If any check fails, fix it before continuing.

## Phase 2 — Add MCP server to each group

For each agent group, register the Memsy MCP server:

```bash
ncl groups config add-mcp-server \
  --group <group-name> \
  --name memsy \
  --command npx \
  --args '["-y","@memsy-io/mcp"]' \
  --env "MEMSY_API_KEY=${MEMSY_API_KEY}"
```

Repeat for every group. If the user has many groups, ask which ones to add Memsy to.

Verify registration:
```bash
ncl groups config get --group <group-name>
```

## Phase 3 — Deploy container skills

Copy the Memsy container skills into the NanoClaw repo's `container/skills/` directory and restart:

```bash
cp -r <memsy-plugin-dir>/container/skills/memsy-recall  container/skills/
cp -r <memsy-plugin-dir>/container/skills/memsy-remember container/skills/
```

The skills will be synced to running containers on next restart or `ncl restart`.

## Phase 4 — Optional: turn sync

Ask the user:

```
AskUserQuestion: "Enable automatic turn sync? When on, Memsy captures every conversation turn so nothing is missed. Set MEMSY_TURN_SYNC=on in your .env"
```

If yes:

1. Add to `.env`:
   ```
   MEMSY_TURN_SYNC=on
   ```

2. Add the turn-sync container skill:
   ```bash
   cp -r <memsy-plugin-dir>/container/skills/memsy-turn-sync container/skills/
   ```

3. Add the host module to `src/modules/index.ts`:
   ```typescript
   import './memsy/index.js';
   ```

4. Copy the module:
   ```bash
   cp -r <memsy-plugin-dir>/src/modules/memsy src/modules/
   ```

5. Rebuild:
   ```bash
   pnpm build
   ```

## Phase 5 — Verify

Restart NanoClaw and send a test message in any connected channel:

> *"Remember that we use Postgres for billing"*

Then in another message:

> *"What did we decide about billing?"*

The agent should call `memsy_search` and surface the stored memory.

If `memsy_search` is unavailable, run `ncl groups config get` to confirm the MCP server is registered and `MEMSY_API_KEY` is set.

## Troubleshooting

**MCP tools not available after config**: Restart the agent container — `ncl restart <group>`.

**`memsy_search` returns no results**: Check the active org with `memsy_list_orgs`. Memories may be in a different profile.

**Turn sync not ingesting**: Check `~/.memsy/turn-sync.log` (if it exists) for API errors. Verify `MEMSY_TURN_SYNC=on` in `.env` and that the host was rebuilt after adding the module.
