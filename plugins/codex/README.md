# Memsy for Codex CLI

Long-term memory for [OpenAI Codex](https://developers.openai.com/codex). Decisions, context, and learnings persist across sessions — surfaced at the right moment via skills, hooks, and the MCP tool layer.

## What you get

| Feature | How |
|---|---|
| **Recall** | `/skills` → `memsy-recall` or ask "what did we decide about X?" |
| **Store** | Say "remember that…" to trigger `memsy-remember` skill |
| **Auto-context** | `MEMSY_SESSION_AUTOCONTEXT=on` — recent memories injected at session start |
| **Proactive mode** | `MEMSY_PROACTIVE=on` — store decisions without explicit "remember that" |
| **Confirm-before-store** | `MEMSY_CONFIRM_STORE=on` — ask before every save |
| **Multi-org** | `memsy_list_orgs` / `memsy_use_org` to switch profiles mid-session |

## Requirements

- Node.js 18+
- Codex CLI (`npm install -g @openai/codex`)
- Memsy API key from [app.memsy.io](https://app.memsy.io)

## Install

```bash
codex plugin marketplace add memsy-io/memsy
codex plugin add memsy@memsy
```

Or run the convenience script:

```bash
./install.sh
```

Then set your API key. `install.sh` **prompts for it interactively** and saves it to `~/.memsy/config.json` (`chmod 600`) — the MCP reads it from there, so no `export` is needed (and it's shared with any other MCP host like Cursor). To set it manually instead:

```bash
export MEMSY_API_KEY=msy_...
```

## Plugin structure

This is a proper Codex plugin — Codex manages MCP registration and hooks automatically:

```
plugins/codex/
├── .codex-plugin/plugin.json   # plugin manifest
├── .mcp.json                   # registers @memsy-io/mcp
├── hooks/
│   ├── hooks.json              # SessionStart hook
│   └── session-start.sh        # auto-context + mode injection
└── skills/
    ├── memsy-recall/SKILL.md
    └── memsy-remember/SKILL.md
```

The `.mcp.json` registers `@memsy-io/mcp` without touching `~/.codex/config.toml` — it's scoped to this plugin.

## Skills

| Skill | Trigger |
|---|---|
| `memsy-recall` | "what did we decide", "remember when", "context on X", "do we have anything about Y" |
| `memsy-remember` | "remember that", "save this decision", "note that", "for future reference" |

Invoke via `/skills` in Codex or type `$memsy-recall` to mention inline.

## Modes

Set environment variables before starting Codex:

| Variable | Effect |
|---|---|
| `MEMSY_SESSION_AUTOCONTEXT=on` | Calls `memsy_list_memories` at session start and injects recent memories as context |
| `MEMSY_PROACTIVE=on` | Watches conversation for save-worthy content (decisions, preferences, learnings) and stores proactively |
| `MEMSY_CONFIRM_STORE=on` | Asks for confirmation before any store operation |
| `MEMSY_SESSION_CONTEXT_LIMIT=N` | Number of memories to surface at session start (default 6, max 20) |

> Hooks are reviewed and trusted once by the user on first run — this is a Codex security feature for plugin-bundled hooks.

**First-run setup.** On your first session without default roles/teams configured, the SessionStart hook shows a **one-time** nudge offering to set them up (self-suppressing — it writes `~/.memsy/.onboard-nudged` and stays silent once defaults exist). Run it anytime by asking *"set up my memsy defaults"* or invoking the `setup-defaults` prompt: it surfaces your org's existing roles/teams, or offers to create them, then persists your choice. Defaults are optional — they sharpen recall and attribution.

## Capabilities

| Capability | Supported |
|---|---|
| Recall (memsy_search) | ✓ |
| Store (memsy_ingest) | ✓ |
| Skills (SKILL.md) | ✓ |
| SessionStart auto-context hook | ✓ |
| Proactive store mode | ✓ |
| Confirm-before-store mode | ✓ |
| Multi-org / profiles | ✓ |

## Troubleshooting

**MCP shows "disconnected"** — Run `MEMSY_API_KEY=msy_... npx -y @memsy-io/mcp` to see the startup error directly.

**Skills not showing** — Run `codex plugin list` to verify the plugin is installed.

**Hook not running** — Codex prompts you to trust plugin-bundled hooks on first use. Check the trust prompt.

**Wrong memories returned** — Ask Codex to call `memsy_list_orgs` and verify the active profile.

Full docs: [docs.memsy.io/docs/codex](https://docs.memsy.io/docs/codex)
