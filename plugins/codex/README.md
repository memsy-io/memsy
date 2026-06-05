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

Then set your API key. `install.sh` **prompts for it interactively** and saves it to `~/.memsy/config.json` (`chmod 600`) — the MCP reads it from there, and it's shared with any other MCP host like Cursor.

> **Don't use a shell `export` for the key on Codex.** Codex launches the MCP server with a curated environment and does **not** pass your login shell's variables to it, so `export MEMSY_API_KEY=...` never reaches the server. Persist it instead — either re-run `./install.sh` (writes `~/.memsy/config.json`) or add it to `~/.codex/config.toml`:
>
> ```toml
> [mcp_servers.memsy.env]
> MEMSY_API_KEY = "msy_..."
> ```

## Plugin structure

This is a proper Codex plugin — Codex manages MCP registration and hooks automatically:

```
plugins/codex/
├── .codex-plugin/plugin.json   # plugin manifest
├── .mcp.json                   # registers @memsy-io/mcp
├── hooks/
│   ├── hooks.json              # SessionStart + UserPromptSubmit + Stop hooks
│   ├── session-start.sh        # auto-context + mode injection + onboarding nudge
│   ├── user-prompt-submit.sh   # turn-sync: stash the user prompt
│   ├── stop.sh                 # turn-sync: POST the completed turn
│   └── turn_sync.py            # shared turn-sync impl (capture / sync)
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

Set these as environment variables before starting Codex (e.g. `export MEMSY_SESSION_AUTOCONTEXT=on`). The mode flags are read by the **SessionStart hook**, not the MCP server, so a shell `export` is the way to set them — Codex forwards your shell environment to hook commands (verified on v0.137). The API key is different — it goes to the MCP server, which gets a curated env, so set it in `~/.memsy/config.json` / `config.toml`, never via `export` (see the install note above).

| Variable | Effect |
|---|---|
| `MEMSY_SESSION_AUTOCONTEXT=on` | Calls `memsy_list_memories` at session start and injects recent memories as context |
| `MEMSY_TURN_SYNC=on` | Captures **every** completed turn — POSTs the user message + assistant reply to `/ingest` (the `UserPromptSubmit` + `Stop` hooks). The backend extraction decides what becomes a durable memory. This is the "store everything" mode (like the Hermes provider); `MEMSY_PROACTIVE` is the lighter "store only the important ones" mode. |
| `MEMSY_PROACTIVE=on` | Watches conversation for save-worthy content (decisions, preferences, learnings) and stores **only those**, with the correct `user_message`/`assistant_message` label for whoever produced the substance |
| `MEMSY_CONFIRM_STORE=on` | Asks for confirmation before any store operation |
| `MEMSY_SESSION_CONTEXT_LIMIT=N` | Number of memories to surface at session start (default 6, max 20) |

> **Turn-sync vs proactive.** `MEMSY_TURN_SYNC` stores *every* turn; `MEMSY_PROACTIVE` stores *only the important ones* automatically; with both off, only explicit "remember that …" is stored. If you enable **both**, the important assistant content is captured twice (once verbatim by turn-sync, once as extracted substance by proactive) — usually fine since the backend de-noises, but proactive's real value is when turn-sync is **off**. Turn-sync hooks run **synchronously** (Codex doesn't support async hooks yet), so the POST is best-effort with a short timeout; failures are logged to `~/.memsy/turn-sync.log` and never block your turn.

> Hooks are reviewed and trusted once by the user on first run — this is a Codex security feature for plugin-bundled hooks.

**First-run setup.** On your first session without default roles/teams configured, the SessionStart hook shows a **one-time** nudge offering to set them up (self-suppressing — it writes `~/.memsy/.onboard-nudged` and stays silent once defaults exist). Run it anytime by asking *"set up my memsy defaults"* or invoking the `setup-defaults` prompt: it surfaces your org's existing roles/teams, or offers to create them, then persists your choice. Defaults are optional — they sharpen recall and attribution.

## Capabilities

| Capability | Supported |
|---|---|
| Recall (memsy_search) | ✓ |
| Store (memsy_ingest) | ✓ |
| Skills (SKILL.md) | ✓ |
| SessionStart auto-context hook | ✓ |
| Turn-sync (store every turn) | ✓ (`MEMSY_TURN_SYNC=on` — `UserPromptSubmit` + `Stop` hooks) |
| Proactive store mode | ✓ |
| Confirm-before-store mode | ✓ |
| Multi-org / profiles | ✓ |

These modes are toggled by env vars read in the **SessionStart hook** (set them before launching Codex, e.g. `export MEMSY_SESSION_AUTOCONTEXT=on`). Verified on Codex v0.137: Codex forwards your shell environment to hook commands, and the hook emits its context using the JSON envelope Codex requires (`{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`) — plain text is rejected. The **API key** does **not** travel via shell env — the MCP server gets a curated environment, so set the key in `~/.memsy/config.json` or `config.toml` (see install note).

## Troubleshooting

**MCP shows "disconnected"** — Run `MEMSY_API_KEY=msy_... npx -y @memsy-io/mcp` to see the startup error directly.

**Skills not showing** — Run `codex plugin list` to verify the plugin is installed.

**Hook not running** — Codex prompts you to trust plugin-bundled hooks on first use. Check the trust prompt.

**Wrong memories returned** — Ask Codex to call `memsy_list_orgs` and verify the active profile.

Full docs: [docs.memsy.io/docs/codex](https://docs.memsy.io/docs/codex)
