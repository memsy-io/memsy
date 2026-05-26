# @memsy-io/mcp

<p align="center">
  <img src="./logo.png" alt="Memsy MCP" width="128" height="128" />
</p>

Memsy [MCP server](https://modelcontextprotocol.io) — drop-in long-term memory for any AI coding agent that speaks MCP (Claude Code, Cursor, VS Code, Cline, Continue.dev, Zed, and more).

One server, every supported host. Search and store memories from your agent's context window.

---

## What you get

13 tools exposed to your AI agent:

| Tool | Purpose |
|---|---|
| `memsy_search` | Semantic search across stored memories. |
| `memsy_ingest` | Store events (chat turns, decisions, facts) — batched up to 100. |
| `memsy_status` | Confirm async ingest finished extraction. |
| `memsy_health` | Connectivity + version check. |
| `memsy_list_memories` | Paginated browse over the console memory store. |
| `memsy_get_memory` | Fetch one memory by ID. |
| `memsy_list_orgs` | List local profiles (one profile = one Memsy org). |
| `memsy_use_org` | Switch which Memsy org subsequent calls hit. |
| `memsy_list_roles` | List roles defined in the active org (for onboarding pickers). |
| `memsy_list_teams` | List teams defined in the active org (for onboarding pickers). |
| `memsy_create_role` | Create a new role in the active org during onboarding. |
| `memsy_create_team` | Create a new team in the active org during onboarding. |
| `memsy_set_defaults` | Set the default role_ids / team_ids for the active profile, optionally persisted to ~/.memsy or ./.memsy. |

Plus 4 resources (`memsy://memories/recent`, `actor/current`, `session/current`, `profile/current`) and 3 prompts (`recall-context`, `setup-defaults`, `summarize-and-store`).

---

## Prerequisites

- **Node.js 18+** (the server runs as a Node process spawned by your host)
- A **Memsy API key** — get one at [app.memsy.io](https://app.memsy.io) → API Keys → Create

Your key looks like `msy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.

---

## Quickstart (2 minutes)

You don't need to install anything globally — `npx` pulls and runs the latest version on demand.

### 1. Pick your host's MCP config file

| Host | Config file |
|---|---|
| Claude Code | `~/.claude.json` (user-level) or `.claude/settings.json` (per-project) |
| Cursor | `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project) |
| Cline (VS Code) | Cline settings → "MCP Servers" |
| Continue.dev | `~/.continue/config.yaml` |
| Zed | `~/.config/zed/settings.json` |

### 2. Paste this entry

JSON (Claude Code, Cursor, VS Code, Cline, Zed):

```json
{
  "mcpServers": {
    "memsy": {
      "command": "npx",
      "args": ["-y", "@memsy-io/mcp"],
      "env": {
        "MEMSY_API_KEY": "msy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

YAML (Continue.dev):

```yaml
mcpServers:
  memsy:
    command: npx
    args: ["-y", "@memsy-io/mcp"]
    env:
      MEMSY_API_KEY: msy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Restart your host

The host re-reads MCP config on launch.

### 4. Verify

- **Claude Code**: type `/mcp` — `memsy` should appear with 8 tools.
- **Cursor**: Settings → Tools & MCP → "memsy" should show a green status dot.
- **Cline**: bottom panel → MCP icon → "memsy" listed.
- **Continue.dev**: type `@` in chat → MCP tools should be discoverable.

Ask your agent something like *"use memsy_health to check the connection"*. Expected:

```json
{ "status": "ok", "version": "...", "base_url": "https://api.memsy.io/v1" }
```

You're done.

---

## Example prompts

Talk to your agent naturally — it picks the tool. Phrasing patterns the tool descriptions are tuned for:

### First-time setup

```
"Set up my Memsy."                    → setup-defaults prompt; lists/creates roles + teams, persists picks.
"Create a role: Software Engineer."   → memsy_create_role (drafts a focus if you omit one).
"Create teams: Platform, Growth."     → memsy_create_team × 2.
"Default team = Platform, save it."   → memsy_set_defaults { persist: "global" }.
"For this project, team = Coding."    → memsy_set_defaults { persist: "project" } — writes ./.memsy/config.json.
```

### Recall

```
"What did we decide about authentication last week?"
"Search memsy for billing migration context."
"Have we discussed Postgres vs Mongo before?"
"What's our convention for password hashing?"
"Before answering, check memsy for context on src/lib/auth.ts."
```

Tips: use the same words you used when storing; if a search returns nothing, *shorten* the query, don't lengthen it; *"show me everything about X"* hits `memsy_list_memories` instead of semantic search.

### Store

Trigger verbs the agent watches for: **remember**, **note**, **save**, **store**.

```
"Remember that we use bcrypt for password hashing."
"Save this decision: shipping freemium before team plan."
"Note: SSO migration blocked on Clerk webhook fix."
"Summarize what we just discussed about caching and store it."   ← summarize-and-store prompt
```

If a profile default role/team is set, each ingest is auto-tagged with it. The response shows `applied_default_role_id` / `applied_default_team_id` so you can confirm.

**Avoid** — these waste memory:
- *"Remember everything we just talked about."* (too vague — produces low-quality "context" memories)
- *"Remember this code: <200 lines>."* (code is in git; store the decision *about* it)
- Transient state (*"I'm currently debugging the login flow"*)

### Browse and inspect

```
"List my 10 most recent memories."
"Show me memories tagged as a decision."
"Fetch memory mem_abc123."
"How many memories do I have?"
"What roles exist in this org?"
```

### Multi-org / context switching

```
"What Memsy profiles do I have?"          → memsy_list_orgs
"Switch to my work profile."              → memsy_use_org { profile: "work" }
"Which Memsy am I on right now?"          → reads memsy://profile/current
```

### Adjusting defaults mid-session

```
"Change my default team to Architect, save it."   → memsy_set_defaults { team_ids: [...], persist: "global" }
"Clear my role default."                          → memsy_set_defaults { role_ids: [], persist: "global" }
"For this session only, drop the team scope."     → ... { persist: "none" }
```

### Diagnostics

```
"Check Memsy connection."     → memsy_health
"What's my Memsy actor_id?"   → reads memsy://actor/current
```

### Always-on proactive mode

By default Memsy fires when you ask. For **decision-triggered store** + **context-aware recall** for the rest of the session, invoke the `proactive-mode` prompt once:

```
"Enable proactive Memsy mode."     ← or pick the proactive-mode prompt from your host's prompt picker
```

After invocation, Claude searches Memsy BEFORE answering when you mention a project/decision/component, and ingests AFTER explicit decisions / preferences / confirmed fixes. Anti-noise rules (skip typos, aborted experiments, raw code, transient state) are baked into the instruction.

This is the closest to always-on Memsy from inside the MCP alone. True session-wide automation requires a Claude Code skill (roadmap).

### Power patterns

Chain tools in one turn:

```
"Search memsy for Q3 launch, summarize the top 5, store the summary."
"Before suggesting a fix, check if we already discussed this bug. Cite prior memories if so."
"Switch to the work profile, find the launch checklist, then switch back."
```

---

## Multi-org setup (optional)

If you work across multiple Memsy orgs (personal + work, multiple clients, etc.), create a config file with named profiles instead of putting the key in `env`.

### 1. Create `~/.memsy/config.json`

```json
{
  "active_profile": "personal",
  "profiles": {
    "personal": {
      "api_key": "msy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "base_url": "https://api.memsy.io/v1",
      "org_label": "Personal"
    },
    "work": {
      "api_key": "msy_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
      "base_url": "https://api.memsy.io/v1",
      "org_label": "Work"
    }
  }
}
```

### 2. Restrict permissions

```bash
chmod 600 ~/.memsy/config.json
```

(The server warns on stderr if it's world-readable.)

### 3. Update your host's MCP config to not pass `MEMSY_API_KEY`

```json
{
  "mcpServers": {
    "memsy": {
      "command": "npx",
      "args": ["-y", "@memsy-io/mcp"]
    }
  }
}
```

The server now picks up profiles from the config file.

### 4. Switch orgs at runtime

Ask the agent: *"use memsy_use_org to switch to work"*. Verify with `memsy://profile/current` resource or *"what's the active memsy profile?"*.

A per-project config at `<project>/.memsy/config.json` overrides the per-user one — handy for repo-specific defaults.

---

## Configuration reference

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MEMSY_API_KEY` | — | API key. Synthesizes a `default` profile if no config file exists. |
| `MEMSY_BASE_URL` | `https://api.memsy.io/v1` | Memsy hot-path API. Override for staging/self-hosted. |
| `MEMSY_PROFILE` | `default` | Which named profile to activate at startup. |
| `MEMSY_ACTOR_ID` | derived | Override the actor identity. See "Identity model" below. |
| `MEMSY_DEFAULT_ROLE_IDS` | — | Comma-separated role IDs applied as default filters. |
| `MEMSY_DEFAULT_TEAM_IDS` | — | Comma-separated team IDs applied as default filters. |

### CLI flags

```bash
npx @memsy-io/mcp --profile work
npx @memsy-io/mcp --api-key msy_... --base-url https://staging.memsy.io/v1
npx @memsy-io/mcp --config /path/to/config.json
```

Flags beat env vars beat config-file `active_profile`.

### Resolution order

API key: `--api-key` flag → `MEMSY_API_KEY` env → active profile's `api_key`.
Profile name: `--profile` flag → `MEMSY_PROFILE` env → config's `active_profile` → `default`.
Config file: `--config` flag → `./.memsy/config.json` → `~/.memsy/config.json`.

---

## Identity model

`actor_id` is what scopes who memories belong to. The server derives a stable, deterministic value:

```
actor_id = sha256("<profile_name>|<git config user.email>")[:16]
```

No PII goes to the server — just the hash. The same developer, same email, same profile, same repo → same actor_id across sessions.

**Defaults**:
- **Ingest** tags new events with this derived `actor_id` so you can tell which were stored via this MCP.
- **Search** is **org-wide** by default — finds memories regardless of which channel stored them (dashboard, SDK, prior MCP sessions). Pass `actor_id` explicitly to scope down.

**Override** with `MEMSY_ACTOR_ID=neel-shah` or per-profile `actor_id` in config.

---

## Troubleshooting

### "MemsyAuthError" or 401

API key is missing, malformed, or revoked. Check:
- `MEMSY_API_KEY` is set in the host's MCP `env` block (not your shell — the host doesn't inherit shell env).
- Key starts with `msy_` and has 32 hex chars.
- Key is active in [app.memsy.io](https://app.memsy.io) → API Keys.

### "MemsyAPIError 404"

Wrong `base_url`. Production hot-path is `https://api.memsy.io/v1` — the `/v1` suffix is required. The server defaults to this; only override if you're on staging/self-hosted.

### `memsy_search` returns `count: 0` but memories exist

The query may not semantically match. Try:
- Broader terms / single keyword
- `memsy_list_memories` (no args) → see what's actually stored
- `threshold: 0` (default) — anything stricter hides weak matches

If you previously stored memories with a specific `actor_id` (via dashboard or SDK), they're still findable since search is org-wide by default. Don't pass `actor_id` unless you want to scope down.

### Server doesn't start / host shows "memsy: disconnected"

Run the server manually to see the error:

```bash
MEMSY_API_KEY=msy_... npx -y @memsy-io/mcp
```

Common causes:
- No key + no config file → "No Memsy profile resolved"
- Config file is invalid JSON → parse error printed to stderr
- Node 17 or older → upgrade to 18+

### Profile-switching doesn't seem to persist

It only persists for the lifetime of the MCP process. Each host spawns a fresh process per chat/session. To make a different profile the default at startup, set `MEMSY_PROFILE` in the host's MCP `env`, or update `active_profile` in the config file.

---

## Security notes

- The config file stores API keys in plain text. `chmod 600` is enforced via stderr warning. Use a passworded keychain manager if your threat model demands it.
- API keys are held in process memory and sent only to your configured `base_url` over HTTPS. They are never logged.
- `memsy_list_orgs` and the `memsy://profile/current` resource never return the API key — only metadata.

---

## License

MIT
