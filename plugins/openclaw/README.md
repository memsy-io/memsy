# Memsy for OpenClaw

Long-term memory for your OpenClaw agent. Recall decisions, store context, and surface the right information — from WhatsApp, Telegram, Slack, Discord, or any channel OpenClaw bridges.

## What you get

| Feature | How |
|---|---|
| **Recall** | Ask "what did we decide about X?" in any connected chat app |
| **Store** | Say "remember that…" — skill extracts and persists the substance |
| **Skills** | `memsy-recall` and `memsy-remember` install as workspace skills |
| **Multi-org** | `memsy_list_orgs` / `memsy_use_org` to switch profiles mid-session |

## Requirements

- Node.js 18+
- OpenClaw gateway running
- Memsy API key from [app.memsy.io](https://app.memsy.io)

## Install

```bash
./install.sh
```

Then set your API key before starting OpenClaw:

```bash
export MEMSY_API_KEY=msy_...
openclaw start
```

## Manual config

Add to `~/.openclaw/openclaw.json`:

```json
{
  "mcpServers": {
    "memsy": {
      "command": "npx",
      "args": ["-y", "@memsy-io/mcp"],
      "env": {
        "MEMSY_API_KEY": "msy_..."
      }
    }
  }
}
```

Restart OpenClaw after editing the config.

## Skills

Two skills install to `~/.openclaw/workspace/skills/`:

| Skill | Trigger |
|---|---|
| `memsy-recall` | "what did we decide", "remember when", "context on X", "do we have anything about Y" |
| `memsy-remember` | "remember that", "save this decision", "note that", "for future reference" |

Skills are available to your agent alongside MCP tools. Since every connected channel (WhatsApp, Telegram, Slack…) routes through the same OpenClaw gateway, Memsy memory is **channel-agnostic** — store from Telegram, recall from Slack.

## Capabilities

| Capability | Supported |
|---|---|
| Recall (search) | ✓ |
| Store (ingest) | ✓ |
| Skills | ✓ |
| Channel-agnostic memory | ✓ |
| SessionStart auto-recall hook | — (no hook API in OpenClaw) |
| Confirm-before-store mode | — |

## Troubleshooting

**MCP shows "disconnected"** — Run `MEMSY_API_KEY=msy_... npx -y @memsy-io/mcp` to see the startup error directly.

**Skills not triggering** — Confirm `~/.openclaw/workspace/skills/memsy-recall/SKILL.md` exists. Re-run `./install.sh`.

**Wrong memories returned** — Ask your agent to call `memsy_list_orgs` and check the active profile.

Full docs: [memsy.io/docs/openclaw](https://memsy.io/docs/openclaw)
