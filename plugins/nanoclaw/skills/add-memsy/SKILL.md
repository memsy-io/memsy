---
name: add-memsy
description: Install Memsy long-term memory into a NanoClaw instance. Run when the user wants persistent memory, automatic conversation capture, or cross-channel recall. Sets up the MCP server, the recall skill, and the host-side turn-sync hooks.
---

Install Memsy into NanoClaw using the **turn-sync** model: every user and assistant message is captured automatically by host-side hooks, and the agent uses `memsy_search` for recall. Work through these phases.

## Phase 1 — Pre-flight

1. `ncl --version` — confirm the CLI is available.
2. `ncl groups list` — confirm at least one agent group; note the `--id` values.
3. Ask the user for two values:

```
AskUserQuestion: "Your Memsy API key? (app.memsy.io → Settings → API Keys)"
AskUserQuestion: "A short identifier to tag your memories? (e.g. 'alice') — used as MEMSY_ACTOR_ID. Required: NanoClaw containers can't derive an identity."
```

## Phase 2 — .env

Add to the fork's `.env`:

```
MEMSY_API_KEY=msy_...
MEMSY_ACTOR_ID=<chosen-id>
MEMSY_TURN_SYNC=on
```

NanoClaw does NOT load `.env` into `process.env` — the helper reads it via `readEnvFile()`, so these only need to be in `.env`, not exported.

## Phase 3 — Shared helper + recall skill

```bash
cp <memsy-plugin-dir>/src/memsy-sync.ts src/memsy-sync.ts
cp -r <memsy-plugin-dir>/container/skills/memsy-recall container/skills/
```

Do NOT install a `memsy-remember` skill — under turn sync it would make the agent call `memsy_ingest`, duplicating memories and sometimes swallowing replies.

## Phase 4 — Host hooks (the core of turn sync)

Add two fire-and-forget calls. Read each file, find the anchor, insert the hook.

**`src/router.ts`** — import at top, then after the `'Message routed'` log inside the routing function:

```typescript
import { memsyIngest } from "./memsy-sync.js";
// ...after writeSessionMessage(...) and the 'Message routed' log:
if (event.message.kind === "chat" || event.message.kind === "chat-sdk") {
  memsyIngest("user_message", event.message.content, session.id).catch(
    () => {},
  );
}
```

**`src/delivery.ts`** — import at top, then after the `'Message delivered'` log inside `deliverMessage`:

```typescript
import { memsyIngest } from "./memsy-sync.js";
// ...after the 'Message delivered' log:
if (msg.kind === "chat") {
  memsyIngest("assistant_message", msg.content, session.id).catch(() => {});
}
```

## Phase 5 — MCP server per group

Register for each group the user wants (use `--id` from Phase 1). `MEMSY_DISABLED_TOOLS=memsy_ingest` is what stops the agent double-writing:

```bash
ncl groups config add-mcp-server \
  --id <group-id> \
  --name memsy \
  --command npx \
  --args '["-y","@memsy-io/mcp"]' \
  --env '{"MEMSY_API_KEY":"msy_...","MEMSY_ACTOR_ID":"<chosen-id>","MEMSY_DISABLED_TOOLS":"memsy_ingest"}'
```

Verify: `ncl groups config get --id <group-id>`.

Also add a belt-and-braces line to each group's `groups/<folder>/CLAUDE.local.md`:

> Memory capture is automatic. Never call memsy_ingest.
>
> At the start of every new conversation turn, call memsy_search with the key topic(s) from the user's message before composing your reply. Use the
> results to surface relevant past context, preferences, or decisions. Skip the search only for trivial one-word acks ("ok", "thanks") or when the
> topic is already covered in the current turn.

## Phase 6 — Build, restart, verify

```bash
pnpm build
# restart the NanoClaw host process
```

Send a message in a connected channel, then ask _"what do you know about me?"_. The agent calls `memsy_search`; the logs show:

```
Memsy turn synced kind=user_message status=200
Memsy turn synced kind=assistant_message status=200
```

## Troubleshooting

- **Ingest 422** → event missing `actor_id`/`session_id` (the helper sets both; check it copied correctly).
- **Nothing synced** → `MEMSY_TURN_SYNC`/key/actor not in `.env`, or host not rebuilt/restarted. Config is read via `readEnvFile`, never `process.env`.
- **Duplicates / no reply** → agent still has `memsy_ingest`; ensure `MEMSY_DISABLED_TOOLS=memsy_ingest` and no `memsy-remember` skill.
- **MCP tools missing** → `ncl groups config get --id <id>`; restart container `ncl groups restart --id <id>`.
