# Memsy for NanoClaw

Long-term memory for [NanoClaw](https://github.com/nanocoai/nanoclaw) — automatic capture of every conversation turn, plus on-demand recall, across every connected channel (WhatsApp, Telegram, Discord, Slack, Signal, …). Memory stored from one channel is searchable from any other.

## How it works (turn sync)

Capture is **automatic and host-side** — the agent never has to decide what to remember:

```
inbound user message  → src/router.ts hook   → memsyIngest('user_message')   ┐
                                                                              ├─→ POST /ingest → Memsy
outbound agent reply  → src/delivery.ts hook → memsyIngest('assistant_message')┘
                         (both via src/memsy-sync.ts, fire-and-forget)
```

Each event carries `actor_id` (from `MEMSY_ACTOR_ID`) and `session_id` (the NanoClaw session) — both **required** by `/ingest`. Memsy's extraction pipeline decides what's memory-worthy.

The agent keeps `memsy_search` for recall but **must not** call `memsy_ingest` (turn sync already captures everything; a duplicate write can also swallow the reply). We enforce that with `MEMSY_DISABLED_TOOLS=memsy_ingest`.

## Requirements

- NanoClaw v2 (container-based, `ncl` CLI)
- Node.js 20+ on the host
- Memsy API key — [app.memsy.io](https://app.memsy.io) → Settings → API Keys
- `MEMSY_ACTOR_ID` — any stable string (e.g. your username). Containers have no `/etc/passwd`, so the server can't derive an identity.

## Install

```bash
git clone https://github.com/memsy-io/memsy
cd memsy/plugins/nanoclaw
./install.sh /path/to/your-nanoclaw-fork
```

The installer copies `src/memsy-sync.ts`, the `memsy-recall` skill, and the `add-memsy` guide, then prints the two hooks to add to `src/router.ts` and `src/delivery.ts` (or run `/add-memsy` in Claude Code to apply them for you).

Then in `.env`:

```bash
MEMSY_API_KEY=msy_...
MEMSY_ACTOR_ID=your-username
MEMSY_TURN_SYNC=on
```

Register the MCP server per group (`--id` from `ncl groups list`):

```bash
ncl groups config add-mcp-server \
  --id <group-id> \
  --name memsy \
  --command npx \
  --args '["-y","@memsy-io/mcp"]' \
  --env '{"MEMSY_API_KEY":"msy_...","MEMSY_ACTOR_ID":"your-username","MEMSY_DISABLED_TOOLS":"memsy_ingest"}'
```

Build + restart the host (`pnpm build`, then restart your NanoClaw process).

## Verify

Send any message in a connected channel, then ask *"what do you know about me?"*. Logs should show:

```
Memsy turn synced kind=user_message status=200
Memsy turn synced kind=assistant_message status=200
```

## What gets installed

| Path (in your NanoClaw fork) | Purpose |
|---|---|
| `src/memsy-sync.ts` | Shared ingest helper (reads `.env` via `readEnvFile`, sends `actor_id`+`session_id`) |
| `container/skills/memsy-recall/` | Recall skill — fires on "what do you know about me", "what did we decide" |
| `.claude/skills/add-memsy/` | `/add-memsy` guided-setup skill for Claude Code |
| `src/router.ts` (patched) | User-message capture hook |
| `src/delivery.ts` (patched) | Assistant-message capture hook |

## Gotchas (learned the hard way)

- **NanoClaw does NOT load `.env` into `process.env`.** Read config via `readEnvFile()` — `process.env.MEMSY_*` is always `undefined`. The shipped helper already does this.
- **`/ingest` requires `actor_id` AND `session_id`** on every event, or it returns 422. The MCP server fills these from its identity layer; direct HTTP callers (the hooks) must supply them.
- **Don't install a `memsy-remember` skill** alongside turn sync — it makes the agent call `memsy_ingest`, duplicating memories and sometimes eating the reply.
- **WhatsApp re-asks for QR on restart?** That's a NanoClaw core bug — its WhatsApp adapter clears auth on any shutdown, not just real logouts. Patch `src/channels/whatsapp.ts` to clear auth only when `reason === DisconnectReason.loggedOut`.

## Troubleshooting

**MCP tools not available** — `ncl groups config get --id <id>` to confirm registration; `ncl groups restart --id <id>`.

**Ingest 422** — missing `actor_id`/`session_id` on the event (see gotchas).

**Duplicate memories / agent stops replying** — agent is calling `memsy_ingest`. Set `MEMSY_DISABLED_TOOLS=memsy_ingest`, remove any `memsy-remember` skill, restart.

**Turn sync silent** — confirm `MEMSY_TURN_SYNC=on` + key + actor id in `.env`, rebuild, restart; check logs for `Memsy turn synced`.

Full docs: [memsy.io/docs/nanoclaw](https://memsy.io/docs/nanoclaw)
