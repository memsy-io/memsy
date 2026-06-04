# Memsy for Hermes Agent

Long-term memory for [Hermes Agent](https://hermes-agent.nousresearch.com) (NousResearch), integrated as a native memory provider. Every conversation turn is automatically synced to Memsy and relevant memories are injected before each LLM call — no MCP layer required.

## What you get

| Feature | How |
|---|---|
| **Auto-prefetch** | Relevant memories injected before every LLM call via `prefetch()` |
| **Auto-sync** | Every user+assistant turn saved to Memsy via `sync_turn()` |
| **Pre-compress snapshot** | Conversation snapshot saved before Hermes discards context |
| **Native tools** | `memsy_search`, `memsy_ingest`, `memsy_health`, `memsy_list_memories` |
| **Onboarding** | `memsy_list_roles` / `memsy_create_role` / `memsy_list_teams` / `memsy_create_team` / `memsy_set_defaults` — surface or create roles/teams and set defaults (persisted to the shared `~/.memsy/config.json`, honored everywhere) |
| **CLI** | `hermes memsy status` / `hermes memsy config` |

## Requirements

- Python 3.10+
- Hermes Agent installed
- Memsy API key from [app.memsy.io](https://app.memsy.io)

## Install

```bash
git clone https://github.com/memsy-io/memsy
cd memsy/plugins/hermes
./install.sh
```

The installer:
1. Copies `memory_provider/` to `~/.hermes/plugins/memsy/`
2. Sets `memory.provider: memsy` in `~/.hermes/config.yaml`

Then set your API key:

```bash
# Option 1 — environment variable (add to ~/.zshrc or ~/.bashrc)
export MEMSY_API_KEY=msy_...

# Option 2 — interactive setup (persists to ~/.hermes/.env)
hermes memory setup
```

Start Hermes:

```bash
hermes chat
```

## Plugin structure

```
plugins/hermes/
├── install.sh
├── memory_provider/              # Dropped into ~/.hermes/plugins/memsy/
│   ├── plugin.yaml               # Declares hooks
│   ├── __init__.py               # MemsyMemoryProvider + register(ctx)
│   └── cli.py                    # hermes memsy status / config
└── README.md
```

## Manual config

Add to `~/.hermes/config.yaml`:

```yaml
memory:
  provider: memsy
```

Add your API key to `~/.hermes/.env`:

```
MEMSY_API_KEY=msy_...
```

## Hooks

| Hook | When called | What it does |
|---|---|---|
| `prefetch` | Before each LLM call | Searches Memsy, returns relevant context |
| `queue_prefetch` | After each turn | Pre-warms cache for next turn |
| `sync_turn` | After each turn | Saves user + assistant content (non-blocking) |
| `on_pre_compress` | Before context compression | Saves conversation snapshot |
| `on_memory_write` | When Hermes writes a built-in memory | Mirrors write to Memsy |
| `on_session_end` | At session end | Waits for pending sync |

## Environment variables

| Variable | Effect |
|---|---|
| `MEMSY_API_KEY` | **Required** (unless saved in `~/.memsy/config.json` or `~/.hermes/memsy.json`). Your `msy_...` key |
| `MEMSY_BASE_URL` | Override the API URL (self-hosted installations) |
| `MEMSY_ACTOR_ID` | Pin a stable actor ID across machines |
| `MEMSY_PROFILE` | Select a named profile from `~/.memsy/config.json` (also changes the derived `actor_id`) |
| `MEMSY_DEFAULT_ROLE_IDS` | Comma-separated default role IDs — search filters + single-default ingest attribution |
| `MEMSY_DEFAULT_TEAM_IDS` | Comma-separated default team IDs — same as roles |

> **Config file precedence.** A per-project `./.memsy/config.json` is used **exclusively** when present — it is *not* merged key-by-key with `~/.memsy/config.json` (this matches the MCP, so your `actor_id` stays aligned across hosts). Make a project config complete: if it omits `api_key`, the global key is **not** inherited.

## Hermes + Memsy: complementary memory

Hermes Agent has a built-in learning loop that extracts skills from experience. Memsy adds a **shared, org-wide layer** — memories from a Codex session, Claude Code session, or a teammate's Hermes session are all searchable here.

## Troubleshooting

**Provider not loading** — Check `~/.hermes/plugins/memsy/` exists. Re-run `./install.sh`.

**`memsy_search` not available** — Run `hermes memsy status` to check connectivity and API key.

**Wrong memories returned** — Set a stable `MEMSY_ACTOR_ID` if you work across multiple machines.

Full docs: [docs.memsy.io/docs/hermes](https://docs.memsy.io/docs/hermes)
