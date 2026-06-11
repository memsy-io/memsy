# Memsy for OpenClaw

Long-term memory for your OpenClaw agent. Recall decisions, store context, and surface the right information — from WhatsApp, Telegram, Slack, Discord, or any channel OpenClaw bridges.

## What you get

| Feature | How |
|---|---|
| **Recall** | Ask "what did we decide about X?" in any connected chat app |
| **Store** | Say "remember that…" — skill extracts and persists the substance |
| **Auto-context** | `MEMSY_SESSION_AUTOCONTEXT=on` — recent memories injected at session start |
| **Native tools** | `memsy_search`, `memsy_ingest`, `memsy_health`, `memsy_list_memories` |
| **Onboarding** | `memsy_list_roles` / `memsy_create_role` / `memsy_list_teams` / `memsy_create_team` / `memsy_set_defaults` — surface or create roles/teams and set defaults |
| **Channel-agnostic** | Store from Telegram, recall from Slack — memory follows the agent, not the channel |
| **Multi-org** | `memsy_list_orgs` / `memsy_use_org` to check active profile |

## Requirements

- Node.js 22+
- OpenClaw gateway running
- Memsy API key from [app.memsy.io](https://app.memsy.io)

## Install

Clone the repo and run the install script — it builds the plugin from source and registers it with OpenClaw:

```bash
git clone https://github.com/memsy-io/memsy
cd memsy/plugins/openclaw
./install.sh
```

## Set your API key

Get a key from [app.memsy.io](https://app.memsy.io), then pick one of:

**Persist in `~/.openclaw/.env` (recommended):**
```bash
echo "MEMSY_API_KEY=msy_..." >> ~/.openclaw/.env
```
OpenClaw loads `~/.openclaw/.env` into the environment on every start — the [official trusted source for provider credentials](https://docs.openclaw.ai/help/environment).

**Interactive / secrets manager (1Password, Bitwarden, Vault, …):**
```bash
openclaw secrets configure
```
OpenClaw's native interactive helper — walks you through a SecretRef so the key stays out of plaintext config entirely.

**Session only (quick test, not persisted):**
```bash
export MEMSY_API_KEY=msy_...
openclaw start
```

**Already configured Memsy elsewhere?** If your key is in the shared `~/.memsy/config.json` (from `memsy auth login` or another host's installer), OpenClaw uses it automatically — no extra step. Precedence: plugin config → `MEMSY_API_KEY` env → `~/.memsy/config.json` active profile.

> Avoid `openclaw config set env.MEMSY_API_KEY` for the key — that stores it as **plaintext in `~/.openclaw/openclaw.json`** (agent-readable), and the config `env` block is non-overriding ("only if missing"). The docs recommend `.env` or a SecretRef for credentials.

## Updating

The plugin is built from source and installed as a copy (`openclaw plugins install` → `~/.openclaw/extensions/memsy/`), so pulling the repo alone changes nothing. To update, pull and re-run the installer — it rebuilds and force-reinstalls the plugin and skills in place (your key and config are untouched):

```bash
cd memsy && git pull
cd plugins/openclaw && ./install.sh
```

Then restart OpenClaw so the refreshed plugin loads.

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
| `MEMSY_PROACTIVE=on` | Watch the conversation for save-worthy content (decisions, preferences) and store without an explicit "remember that" |
| `MEMSY_CONFIRM_STORE=on` | Ask before every store operation |
| `MEMSY_ACTOR_ID=<id>` | Pin a stable `actor_id` (top precedence). Otherwise resolved as: config-file `actor_id` → `sha256("<profile>\|<git-email>")` → `sha256("<profile>\|<user>@<host>")` |
| `MEMSY_DEFAULT_ROLE_IDS=a,b` | Comma-separated default role IDs — search filters + single-default ingest attribution (also read from `~/.memsy/config.json`) |
| `MEMSY_DEFAULT_TEAM_IDS=a,b` | Comma-separated default team IDs — same as roles |
| `MEMSY_BASE_URL=https://...` | Override the Memsy API URL (self-hosted installations) |
| `MEMSY_PROFILE=<name>` | Selects which profile slice to load from `~/.memsy/config.json` (defaults, `actor_id`) and is a component of the derived `actor_id` — not merely informational. Switch API keys by restarting with a new `MEMSY_API_KEY` or a different active profile. |

> **Config file precedence.** A per-project `./.memsy/config.json` is used **exclusively** when present — it is *not* merged key-by-key with `~/.memsy/config.json` (this matches the MCP, so your `actor_id` stays aligned across hosts). Make a project config complete: if it omits `api_key`, the global key is **not** inherited.

## Capabilities

| Capability | Supported |
|---|---|
| Recall (`memsy_search`) | ✓ |
| Store (`memsy_ingest`) | ✓ |
| Skills (`SKILL.md`) | ✓ |
| Session start auto-context | ✓ (`MEMSY_SESSION_AUTOCONTEXT=on`) |
| Honors default roles/teams | ✓ (read from `~/.memsy/config.json`; filters search + attributes ingest) |
| Onboarding (create/list roles+teams, set defaults) | ✓ (`memsy_set_defaults` persists to shared config) |
| Channel-agnostic memory | ✓ |
| Multi-org / profiles | ✓ (via env var, full multi-profile requires config layer) |

## Troubleshooting

**Plugin not loading** — Run `openclaw plugins inspect memsy --runtime` to see load errors.

**Tools not visible** — Run `openclaw plugins list` to confirm the plugin is installed and enabled.

**Skills not triggering** — Run `openclaw skills list` to verify the skills are installed.

**API key error** — Persist the key in `~/.openclaw/.env` (`echo 'MEMSY_API_KEY=msy_...' >> ~/.openclaw/.env`) so it survives restarts, then restart. Or run `openclaw secrets configure` for a SecretRef. Avoid `openclaw config set env.MEMSY_API_KEY` — it stores the key as plaintext in `~/.openclaw/openclaw.json` (see the API-key note above).

**Wrong memories returned** — Ask your agent to call `memsy_list_orgs` and verify the active profile, then `memsy_health` to confirm connectivity.

Full docs: [docs.memsy.io/docs/openclaw](https://docs.memsy.io/docs/openclaw)
