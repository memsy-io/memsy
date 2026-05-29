# Memsy for Hermes Agent

Long-term memory for [Hermes Agent](https://hermes-agent.nousresearch.com) (NousResearch). Decisions and context persist across sessions — Hermes's own learning loop plus Memsy's org-wide memory gives you both local and shared recall.

## What you get

| Feature | How |
|---|---|
| **Recall** | Ask "what did we decide about X?" — Hermes calls `memsy_search` |
| **Store** | Say "remember that…" — Hermes calls `memsy_ingest` |
| **Auto-context** | `MEMSY_SESSION_AUTOCONTEXT=on` — recent memories injected at session start via `pre_llm_call` hook |
| **Bundled skills** | `memsy-recall` and `memsy-remember` ship with the plugin |
| **Multi-org** | `memsy_list_orgs` / `memsy_use_org` to switch profiles mid-session |

## Requirements

- Python 3.10+
- Node.js 18+ (for the MCP server)
- Hermes Agent installed
- Memsy API key from [app.memsy.io](https://app.memsy.io)

## Install

```bash
export MEMSY_API_KEY=msy_...
./install.sh
hermes chat
```

The installer:
1. Copies `plugin/` to `~/.hermes/plugins/memsy/` (Python plugin with hooks + skills)
2. Adds `mcp_servers.memsy` to `~/.hermes/config.yaml` (registers `@memsy-io/mcp`)
3. Adds `memsy` to `plugins.enabled` in `~/.hermes/config.yaml`

## Plugin structure

```
plugins/hermes/
├── install.sh
├── plugin/                  # Dropped into ~/.hermes/plugins/memsy/
│   ├── plugin.yaml          # manifest: name, version, provides_hooks
│   ├── __init__.py          # register(ctx) — hooks + skill registration
│   └── skills/
│       ├── memsy-recall/SKILL.md
│       └── memsy-remember/SKILL.md
└── README.md
```

The Python plugin adds lifecycle hooks and skills on top of the MCP tools. MCP provides `memsy_search`, `memsy_ingest`, `memsy_health`, etc. as native Hermes tools.

## Manual config

Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  memsy:
    command: npx
    args: ["-y", "@memsy-io/mcp"]
    enabled: true
    env:
      MEMSY_API_KEY: "msy_your_actual_key_here"

plugins:
  enabled:
    - memsy
```

> **Note:** The `env` block takes literal values — shell variable references like `${MEMSY_API_KEY}` are not expanded by YAML. Either write your actual key here or omit the `env` block and set `MEMSY_API_KEY` in your shell before starting Hermes.

Reload without restarting: `/reload-mcp` inside `hermes chat`.

## Modes

| Variable | Effect |
|---|---|
| `MEMSY_SESSION_AUTOCONTEXT=on` | Fetches recent memories and injects them into the first turn via `pre_llm_call` hook |
| `MEMSY_SESSION_CONTEXT_LIMIT=N` | Number of memories to surface at session start (default 6, max 20) |
| `MEMSY_BASE_URL=https://...` | Override the Memsy API URL (self-hosted installations) |

## Capabilities

| Capability | Supported |
|---|---|
| Recall (`memsy_search`) | ✓ |
| Store (`memsy_ingest`) | ✓ |
| Skills (`SKILL.md`) | ✓ (bundled via plugin) |
| Session start auto-context | ✓ (`MEMSY_SESSION_AUTOCONTEXT=on`, `pre_llm_call` hook) |
| Multi-org / profiles | ✓ |
| MCP tool filtering (`tools:`) | ✓ (via `mcp_servers.memsy.tools.include` in config) |

### Limiting exposed tools (optional)

```yaml
mcp_servers:
  memsy:
    command: npx
    args: ["-y", "@memsy-io/mcp"]
    enabled: true
    tools:
      include: [memsy_search, memsy_ingest, memsy_health, memsy_status]
```

## Hermes + Memsy: complementary memory

Hermes Agent has a built-in learning loop that extracts skills from experience. Memsy adds a **shared, org-wide layer** — so memories stored from a Codex session, a Claude Code session, or a teammate's Hermes session are all searchable here. The two systems complement rather than duplicate each other.

## Troubleshooting

**Plugin not loading** — Run `hermes plugins list` to check that `memsy` is in the enabled list. If not, run `hermes plugins enable memsy`.

**MCP shows "disconnected"** — Run `MEMSY_API_KEY=msy_... npx -y @memsy-io/mcp` to see the startup error directly.

**Tools not available after config change** — Use `/reload-mcp` in `hermes chat` to reload without restarting.

**Skills not triggering** — Run `hermes skills list` to verify `memsy:memsy-recall` and `memsy:memsy-remember` appear. Skills bundled by a plugin are namespaced as `plugin:skill-name`.

**Wrong memories returned** — Ask Hermes to call `memsy_list_orgs` and verify the active profile, then `memsy_health` to confirm connectivity.

Full docs: [memsy.io/docs/hermes](https://memsy.io/docs/hermes)
