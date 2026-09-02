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
- Codex CLI **v0.125+** (`npm install -g @openai/codex@latest`) — older versions lack `codex plugin add`; they can still install via the `/plugins` browser inside Codex
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

## Updating

Codex serves the plugin from the marketplace's Git snapshot (pinned to `main`). Changes land for users once they're on `main` — there's no version to bump; you pull them with two commands:

```bash
codex plugin marketplace upgrade memsy   # re-pull the snapshot from main
codex plugin add memsy@memsy             # re-extract the refreshed plugin into the cache
```

`plugin add` overwrites the cached copy from the freshly-upgraded snapshot (it does not skip just because the version is unchanged), so this delivers the latest `main` even though the version stays `0.1.0`. If an update ever doesn't seem to take, force a clean re-install:

```bash
codex plugin remove memsy && codex plugin add memsy@memsy
```

Then **restart Codex** so the refreshed plugin loads. Because plugin-bundled hooks are untrusted until reviewed, a changed hook is re-flagged after an update — run **`/hooks`** and re-trust Memsy's hooks, or turn-sync / auto-context will silently stay off (see [Hook trust](#hook-trust)). To confirm, ask *"What do we know about X?"* and check that `memsy-recall` fires.

> The **MCP server** (`@memsy-io/mcp`) is fetched separately by `npx` and updates on its own cadence — see [Troubleshooting](#troubleshooting) if Memsy tools behave like an older version after an update.

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

> **Turn-sync needs the API key on disk.** Unlike the mode flags (shell env), turn-sync POSTs directly to the API, so it resolves the key from — in order — the shell env, `~/.codex/config.toml` `[mcp_servers.memsy.env]`, then the active profile in `~/.memsy/config.json`. If recall works but `~/.memsy/turn-sync.log` says `no API key`, your key is somewhere this hook can't read it; the simplest fix is `./install.sh` (writes `~/.memsy/config.json`). To keep turn-sync's `actor_id` aligned with what `memsy_search` reads, **pin identity with `memsy_set_defaults { actor_id: "…", persist: "global" }`** (writes the config file both surfaces read) rather than `export MEMSY_ACTOR_ID=…`, which the hook sees but the MCP server's curated env may not.

### Hook trust

Plugin-bundled hooks are a Codex security feature: they're **untrusted until you review them via `/hooks`**, and Codex **re-flags them after any change to the hook definition** — including when you update the plugin. Until you trust (or re-trust) them, the hooks are silently skipped, so `MEMSY_SESSION_AUTOCONTEXT` / `MEMSY_TURN_SYNC` appear to do nothing even when set. If a mode isn't firing, open `/hooks`, confirm Memsy's hooks are listed and trusted, then restart Codex.

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

**`error: unrecognized subcommand 'add'` during install** — Your Codex CLI predates `codex plugin add` (added around v0.125). Update and re-run: `npm install -g @openai/codex@latest && ./install.sh`. Or install without updating: start `codex`, run `/plugins`, open the **memsy** marketplace, select **memsy**, and choose **Install plugin**.

**MCP shows "disconnected"** — Run `MEMSY_API_KEY=msy_... npx -y @memsy-io/mcp` to see the startup error directly.

**Skills not showing** — Run `codex plugin list` to verify the plugin is installed.

**Hook not running** (auto-context / turn-sync does nothing) — Plugin hooks must be trusted via `/hooks` before they run, and are **re-flagged after every plugin update**. Open `/hooks`, trust Memsy's hooks, then restart Codex (see [Hook trust](#hook-trust)). For turn-sync specifically, also check `~/.memsy/turn-sync.log` — `no API key` there means the key isn't where the hook can read it (see the turn-sync key note under [Modes](#modes)).

**Wrong memories returned** — Ask Codex to call `memsy_list_orgs` and verify the active profile.

**Memsy tools behave like an older version** — A globally-installed `@memsy-io/mcp` shadows the plugin's `npx -y @memsy-io/mcp`, pinning you to a stale build. Check and remove it: `npm ls -g @memsy-io/mcp` → if it's listed, `npm uninstall -g @memsy-io/mcp`, then restart Codex. See [MCP troubleshooting](https://docs.memsy.io/docs/mcp#troubleshooting) for the full version-update guide.

Full docs: [docs.memsy.io/docs/codex](https://docs.memsy.io/docs/codex)
