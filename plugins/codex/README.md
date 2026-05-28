# Memsy for Codex CLI

Long-term memory for OpenAI Codex. Decisions, context, and learnings persist across sessions and projects.

## What you get

| Feature | How |
|---|---|
| **Recall** | `/skills` → `memsy-recall` or just ask "what did we decide about X?" |
| **Store** | Say "remember that…" or use `memsy-remember` skill |
| **Auto-context** | `AGENTS.md` instructs Codex to search Memsy at session start |
| **Multi-org** | `memsy_list_orgs` / `memsy_use_org` to switch profiles mid-session |

## Requirements

- Node.js 18+
- Codex CLI (`npm install -g @openai/codex`)
- Memsy API key from [app.memsy.io](https://app.memsy.io)

## Install

```bash
./install.sh           # global install (MCP + skills)
./install.sh --project # also appends Memsy section to ./AGENTS.md
```

Then add your API key to the MCP env block in `~/.codex/config.toml`:

```toml
[mcp_servers.memsy.env]
MEMSY_API_KEY = "msy_..."
```

> The Codex host does not inherit shell environment variables — the key must live in the config file's env block.

## Manual config

If you prefer to configure by hand:

```toml
# ~/.codex/config.toml

[mcp_servers.memsy]
command = "npx"
args = ["-y", "@memsy-io/mcp"]

[mcp_servers.memsy.env]
MEMSY_API_KEY = "msy_..."
```

Or via CLI:

```bash
codex mcp add memsy -- npx -y @memsy-io/mcp
```

## Skills

Two skills install to `~/.codex/skills/`:

| Skill | Trigger |
|---|---|
| `memsy-recall` | "what did we decide", "remember when", "context on X", "do we have anything about Y" |
| `memsy-remember` | "remember that", "save this decision", "note that", "for future reference" |

Invoke via `/skills` in the Codex CLI or type `$memsy-recall` to mention inline.

## AGENTS.md (recommended)

The `AGENTS.md.snippet` in this directory gives Codex proactive instructions — search Memsy at session start, store decisions automatically. Append it:

```bash
cat AGENTS.md.snippet >> AGENTS.md
```

## Capabilities

| Capability | Supported |
|---|---|
| Recall (search) | ✓ |
| Store (ingest) | ✓ |
| Skills | ✓ |
| AGENTS.md context | ✓ |
| SessionStart auto-recall hook | — (no hook API in Codex) |
| Confirm-before-store mode | — |

## Troubleshooting

**MCP shows "disconnected"** — Run `MEMSY_API_KEY=msy_... npx -y @memsy-io/mcp` in your terminal to see the startup error.

**Skills not showing** — Confirm `~/.codex/skills/memsy-recall/SKILL.md` exists. Re-run `./install.sh`.

**Wrong memories returned** — Check active org: ask Codex to call `memsy_list_orgs`. Switch with `memsy_use_org`.

Full docs: [memsy.io/docs/codex](https://memsy.io/docs/codex)
