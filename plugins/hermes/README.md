# Memsy for Hermes Agent

Long-term memory for [Hermes Agent](https://hermes-agent.nousresearch.com) (NousResearch). Decisions and context persist across sessions — Hermes's own learning loop plus Memsy's org-wide memory gives you both local and shared recall.

## What you get

| Feature | How |
|---|---|
| **Recall** | Ask "what did we decide about X?" — Hermes calls `memsy_search` |
| **Store** | Say "remember that…" — Hermes calls `memsy_ingest` |
| **Multi-org** | `memsy_list_orgs` / `memsy_use_org` to switch profiles mid-session |
| **Diagnostics** | `memsy_health` to verify connectivity |

## Requirements

- Node.js 18+
- Hermes Agent (`npm install -g @nousresearch/hermes-agent`)
- Memsy API key from [app.memsy.io](https://app.memsy.io)

## Install

```bash
./install.sh
```

Then set your API key before starting Hermes:

```bash
export MEMSY_API_KEY=msy_...
hermes chat
```

## Manual config

Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  memsy:
    command: npx
    args: ["-y", "@memsy-io/mcp"]
    enabled: true
    env:
      MEMSY_API_KEY: "${MEMSY_API_KEY}"
```

Reload without restarting: `/reload-mcp` inside `hermes chat`.

## Capabilities

| Capability | Supported |
|---|---|
| Recall (search) | ✓ |
| Store (ingest) | ✓ |
| Multi-org / profiles | ✓ |
| MCP tool filtering (`tools:`) | ✓ (via config) |
| Skills / SKILL.md | — (Hermes uses its own Skills Hub) |
| SessionStart auto-recall hook | — |

### Limiting exposed tools (optional)

To expose only recall/store tools and hide management tools:

```yaml
mcp_servers:
  memsy:
    command: npx
    args: ["-y", "@memsy-io/mcp"]
    enabled: true
    env:
      MEMSY_API_KEY: "${MEMSY_API_KEY}"
    tools:
      include: [memsy_search, memsy_ingest, memsy_health, memsy_status]
```

## Hermes + Memsy: complementary memory

Hermes Agent has a built-in learning loop that extracts skills from experience. Memsy adds a **shared, org-wide layer** — so memories stored from a Codex session, a Claude Code session, or a teammate's Hermes session are all searchable here. The two systems complement rather than duplicate each other.

## Troubleshooting

**MCP shows "disconnected"** — Run `MEMSY_API_KEY=msy_... npx -y @memsy-io/mcp` to see the startup error directly.

**Tools not available after config change** — Use `/reload-mcp` in `hermes chat` to reload without restarting.

**Wrong memories returned** — Ask Hermes to call `memsy_list_orgs` and verify the active profile.

Full docs: [memsy.io/docs/hermes](https://memsy.io/docs/hermes)
