# Memsy for NanoClaw

Long-term memory for [NanoClaw](https://github.com/nanocoai/nanoclaw) — recall past decisions and store context across every connected channel (WhatsApp, Telegram, Discord, Slack, Signal, and more). Memories from one channel are immediately searchable from any other.

## What you get

| Feature | How |
|---|---|
| **Recall** | Ask "what did we decide about X?" — agent calls `memsy_search` via MCP |
| **Store** | Say "remember that…" — agent calls `memsy_ingest` via MCP |
| **Turn sync** | `MEMSY_TURN_SYNC=on` — every turn auto-ingested via host delivery action |
| **Multi-channel** | One memory store, all channels — store in WhatsApp, recall in Telegram |
| **Multi-org** | `memsy_list_orgs` / `memsy_use_org` to switch profiles |

## Requirements

- NanoClaw v2 (container-based, `ncl` CLI available)
- Node.js 20+ on the host
- Memsy API key — [app.memsy.io](https://app.memsy.io) → Settings → API Keys

## Install

```bash
git clone https://github.com/memsy-io/memsy
cd memsy/plugins/nanoclaw
./install.sh /path/to/your-nanoclaw-fork
```

Then register the MCP server for each agent group:

```bash
ncl groups config add-mcp-server \
  --group <group-name> \
  --name memsy \
  --command npx \
  --args '["-y","@memsy-io/mcp"]' \
  --env '{"MEMSY_API_KEY":"msy_..."}'
```

Restart and verify:

```
Remember that we use Postgres for billing
What did we decide about billing?
```

## What gets installed

| Path (in your NanoClaw fork) | Purpose |
|---|---|
| `container/skills/memsy-recall/` | Recall skill — synced to every agent container |
| `container/skills/memsy-remember/` | Store skill — synced to every agent container |
| `.claude/skills/add-memsy/` | `/add-memsy` operational skill for guided setup |
| `container/skills/memsy-turn-sync/` | Turn sync skill (optional, requires `MEMSY_TURN_SYNC=on`) |
| `src/modules/memsy/index.ts` | Host delivery action for turn sync (optional) |

## Turn sync

For fully automatic memory capture (no "remember that" needed), enable turn sync:

1. Set `MEMSY_TURN_SYNC=on` in `.env`
2. Re-run `./install.sh` and answer `y` to the turn sync prompt (or manually copy `src/modules/memsy/` and add the import to `src/modules/index.ts`)
3. `pnpm build && restart NanoClaw`

When active, agents emit a `memsy_ingest_turn` delivery action after each response. The host module catches it and forwards the turn to Memsy's ingest API. Memsy's async extraction pipeline decides what's memory-worthy — no filtering needed in NanoClaw.

## Architecture

```
NanoClaw container (Bun)
  └── Claude Agent SDK
        ├── @memsy-io/mcp (registered via ncl groups config)
        │     ├── memsy_search
        │     ├── memsy_ingest
        │     ├── memsy_health
        │     └── memsy_list_orgs / memsy_use_org
        └── Container skills
              ├── memsy-recall     ← fires on "what did we decide..."
              ├── memsy-remember   ← fires on "remember that..."
              └── memsy-turn-sync  ← emits memsy_ingest_turn after each response

NanoClaw host (Node)
  └── Delivery module (src/modules/memsy/index.ts)
        └── registerDeliveryAction('memsy_ingest_turn')
              └── POST /ingest → api.memsy.io/v1
```

## Troubleshooting

**MCP tools not available**: Run `ncl groups config get --group <name>` to verify the MCP server is registered. Restart the container: `ncl restart <group>`.

**Recall returns nothing**: Check the active org — `memsy_list_orgs`. Memories may be in a different profile.

**Turn sync not working**: Check `.env` for `MEMSY_TURN_SYNC=on`, verify `pnpm build` ran after adding the module, and confirm the import exists in `src/modules/index.ts`.

Full docs: [memsy.io/docs/nanoclaw](https://memsy.io/docs/nanoclaw)
