# Memsy for OpenClaw

Long-term memory for your OpenClaw agent. Recall decisions, store context, and surface the right information — from WhatsApp, Telegram, Slack, Discord, or any channel OpenClaw bridges.

## What you get

| Feature | How |
|---|---|
| **Recall** | Ask "what did we decide about X?" in any connected chat app |
| **Store** | Say "remember that…" — skill extracts and persists the substance |
| **Auto-context** | `MEMSY_SESSION_AUTOCONTEXT=on` — recent memories injected at session start |
| **Native tools** | `memsy_search`, `memsy_ingest`, `memsy_health`, `memsy_list_memories` |
| **Channel-agnostic** | Store from Telegram, recall from Slack — memory follows the agent, not the channel |
| **Multi-org** | `memsy_list_orgs` / `memsy_use_org` to check active profile |

## Requirements

- Node.js 22+
- OpenClaw gateway running
- Memsy API key from [app.memsy.io](https://app.memsy.io)

## Install

```bash
openclaw plugins install clawhub:memsy-io/memsy-openclaw
openclaw skills install memsy-recall
openclaw skills install memsy-remember
```

Or run the convenience script:

```bash
./install.sh
```

Then set your API key before starting OpenClaw:

```bash
export MEMSY_API_KEY=msy_...
openclaw start
```

## Plugin structure

This is a proper OpenClaw TypeScript plugin — OpenClaw manages tool registration and session hooks automatically:

```
plugins/openclaw/
├── openclaw.plugin.json     # plugin manifest (id, contracts.tools, configSchema)
├── package.json             # openclaw metadata (extensions, compat, build)
├── src/
│   └── index.ts             # definePluginEntry — tools + session_start hook
└── skills/
    ├── memsy-recall/SKILL.md
    └── memsy-remember/SKILL.md
```

The plugin registers tools directly into the OpenClaw agent runtime via `api.registerTool()`. No separate MCP process — tools call the Memsy API over HTTPS.

## Skills

Skills are installed separately via `openclaw skills install` and tell the agent when and how to use the Memsy tools:

| Skill | Trigger |
|---|---|
| `memsy-recall` | "what did we decide", "remember when", "context on X", "do we have anything about Y" |
| `memsy-remember` | "remember that", "save this decision", "note that", "for future reference" |

Skills can also live in your workspace under `./skills/` and override the ClawHub versions.

## Modes

| Variable | Effect |
|---|---|
| `MEMSY_SESSION_AUTOCONTEXT=on` | Fetches recent memories at session start and injects them into the agent's first-turn context |
| `MEMSY_SESSION_CONTEXT_LIMIT=N` | Number of memories to surface at session start (default 6, max 20) |
| `MEMSY_BASE_URL=https://...` | Override the Memsy API URL (self-hosted installations) |
| `MEMSY_PROFILE=<name>` | Active profile name (informational — switch API keys by restarting with a new `MEMSY_API_KEY`) |

## Capabilities

| Capability | Supported |
|---|---|
| Recall (`memsy_search`) | ✓ |
| Store (`memsy_ingest`) | ✓ |
| Skills (`SKILL.md`) | ✓ |
| Session start auto-context | ✓ (`MEMSY_SESSION_AUTOCONTEXT=on`) |
| Channel-agnostic memory | ✓ |
| Multi-org / profiles | ✓ (via env var, full multi-profile requires config layer) |

## Troubleshooting

**Plugin not loading** — Run `openclaw plugins inspect memsy --runtime` to see load errors.

**Tools not visible** — Run `openclaw plugins list` to confirm the plugin is installed and enabled.

**Skills not triggering** — Run `openclaw skills list` to verify the skills are installed.

**API key error** — Ensure `MEMSY_API_KEY=msy_...` is set before starting the gateway. OpenClaw does not inherit shell env by default; set it in your gateway supervisor config.

**Wrong memories returned** — Ask your agent to call `memsy_list_orgs` and verify the active profile, then `memsy_health` to confirm connectivity.

Full docs: [memsy.io/docs/openclaw](https://memsy.io/docs/openclaw)
