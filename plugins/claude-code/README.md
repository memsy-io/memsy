# Memsy for Claude Code

Long-term memory for Claude Code — recall, store, and share decisions across sessions, hosts, and teammates.

This plugin wraps [`@memsy-io/mcp`](https://www.npmjs.com/package/@memsy-io/mcp) with Claude Code-native UX. The MCP server provides all the tools and resources; this plugin adds slash commands, skills, and hooks so the surface is discoverable from inside Claude Code.

> **Status: v0.4.0 — all milestones**
> Slash commands, skills, opt-in `SessionStart` auto-context, `/memsy-checkpoint` for save-the-conversation, `/memsy-index` for codebase snapshotting, `memsy-archivist` subagent for deep retrieval, and a full docs page at <https://docs.memsy.io/docs/claude-code>. See [PLAN.md](./PLAN.md) for the full roadmap and rationale.

## Install

1. **Get an API key** at <https://app.memsy.io>.
2. **Set it in your shell** (e.g. `~/.zshrc` / `~/.bashrc`):
   ```sh
   export MEMSY_API_KEY=msy_...
   ```
3. **Add the Memsy marketplace + install the plugin:**
   ```sh
   claude plugin marketplace add memsy-io/memsy
   claude plugin install memsy@memsy
   ```
4. **Restart Claude Code** so it loads the plugin's MCP server.
5. **Verify:**
   ```
   /memsy doctor
   ```
   (or the namespaced form `/memsy:memsy-doctor`). You should see a "Status: ok" block with your active profile and `actor_id`.

## Local development

If you're iterating on the MCP server itself (`memsy/mcp/`), point the plugin at your local build:

```sh
# 1. Build the MCP
cd /path/to/memsy/mcp
npm run build

# 2. Rewrite the plugin's .mcp.json to use the local build
cd /path/to/memsy/plugins/claude-code
./install.sh --dev /path/to/memsy

# 3. Restart Claude Code
```

To switch back to the published npm version:

```sh
./install.sh --prod
```

## Slash commands

### `/memsy <anything>` — universal entry point (smart router)

This is the only slash you really need. The `memsy` skill reads what you typed after the slash, classifies intent, and runs the matching workflow. You don't have to remember subcommands.

```
/memsy what did we decide about billing storage?     → searches memories
/memsy remember we picked Postgres for billing       → stores a memory
/memsy switch to work                                → switches profile
/memsy list                                          → lists recent memories
/memsy doctor                                        → runs the health check
/memsy setup                                         → first-time walkthrough
/memsy                                               → shows the menu above
```

Routing rules: leading verbs (`remember`, `save`, `switch to`, `list`, `doctor`, `setup`) pick the intent; bare topics default to **search** (most common ask, safest fallback). When ambiguous, the router asks rather than guessing.

> Implementation note: `/memsy` is backed by a skill (not a command) because Claude Code namespaces plugin commands as `/<plugin>:<command>` but exposes skills at the top level. Making the smart router a skill is what makes `/memsy` work without the `memsy:` prefix.

### `/memsy:<name>` — explicit namespaced fast paths

For users who know exactly which action they want:

| Command | Args | Description |
|---|---|---|
| `/memsy:memsy-remember <text>` | free text | Store a fact / decision / note |
| `/memsy:memsy-org [name]` | profile name | Switch active profile / org. No-arg lists profiles. |
| `/memsy:memsy-setup` | none | First-time walkthrough — pick default role(s), team(s), pin `actor_id` |
| `/memsy:memsy-doctor` | none | Health + identity diagnostic with per-error next-step pointers |
| `/memsy:memsy-checkpoint` | none | Review and save save-worthy content from the current conversation — manual replacement for an unsupported "save on session end" hook |
| `/memsy:memsy-index` | none | One-shot ingest of a structured codebase summary (per-ecosystem playbook for JS / Python / Rust / Go / Ruby / JVM) |

## Hooks

### SessionStart auto-context (opt-in)

When `MEMSY_SESSION_AUTOCONTEXT=on` is set in the shell that launches Claude Code, the plugin's `SessionStart` hook injects a "Memsy recall" context block before your first message — surfacing the most recent N memories from the active profile.

| Env var | Default | Purpose |
|---|---|---|
| `MEMSY_SESSION_AUTOCONTEXT` | `off` | Set to `on` to enable auto-context. |
| `MEMSY_SESSION_CONTEXT_LIMIT` | `6` | How many memories to surface. Clamped to 1–20. |

Turn it off by unsetting the env var and restarting Claude Code. The hook is silent unless explicitly opted in.

> **Why no auto-save-on-end hook?** Claude Code's `SessionEnd` and `Stop` hooks don't pipe their stdout back into Claude, so an auto-save hook can't actually call MCP tools to store anything. We ship `/memsy-checkpoint` as a user-initiated command instead — safer (no surprise noise) and actually functional.

## Subagents

| Agent | Trigger | Purpose |
|---|---|---|
| `memsy-archivist` | Explicit invocation via Task tool, or when you ask "do a deep memsy dive on X" / "audit all our past decisions on X" | Multi-query exploration — runs 3–5 query variants in parallel, clusters by theme, dedupes, returns structured summary with explicit gap-list. (Subagents are invoked explicitly; they do not auto-fire from description matching.) |

### MCP-level prompts (also available in Cursor, VS Code, Cline, etc.)

These are exposed by the `@memsy-io/mcp` server itself, so they work in any MCP host:

| Prompt | Description |
|---|---|
| `/memsy:recall-context` | Structured recall — Claude Code prompts you for `topic` + `limit` |
| `/memsy:proactive-mode` | Switch the session into proactive recall mode |
| `/memsy:setup-defaults` | Same as `/memsy-setup`, host-agnostic version |
| `/memsy:summarize-and-store` | Summarize recent turns into a single memory and store it |

## Skills (auto-fire on natural phrasing — no slash needed)

| Skill | Fires when you say… |
|---|---|
| `memsy-recall` | "what did we decide", "remember when", "have we discussed", "context on X", "do we have anything about Y" |
| `memsy-remember` | "remember that", "save this decision", "note that", "let's remember", "store this" |
| `memsy-setup` | Any Memsy MCP failure or "memsy not working" / "set up memsy" — diagnoses and walks through the fix |

## Environment

| Var | Purpose |
|---|---|
| `MEMSY_API_KEY` | **Required.** Your `msy_...` key. |
| `MEMSY_BASE_URL` | Override API endpoint (default: `https://api.memsy.io/v1`). |
| `MEMSY_PROFILE` | Select a named profile from `~/.memsy/config.json`. |
| `MEMSY_ACTOR_ID` | Pin a stable `actor_id` (otherwise it's derived from `git config user.email` or `$USER@hostname`). |
| `MEMSY_DEFAULT_ROLE_IDS` | Comma-separated default role filters for searches. |
| `MEMSY_DEFAULT_TEAM_IDS` | Comma-separated default team filters for searches. |
| `MEMSY_SESSION_AUTOCONTEXT` | `on` to enable SessionStart auto-context. Default: `off`. |
| `MEMSY_SESSION_CONTEXT_LIMIT` | How many memories the SessionStart hook surfaces. Default: `6`, clamped 1–20. |
| `MEMSY_CONFIRM_STORE` | `on` to require confirmation before every single-item memory store (`/memsy:memsy-remember`, the `memsy-remember` auto-fire skill, and the `/memsy remember` smart-router branch). Default: `off` (stores directly — deliberate slash invocation implies intent). Bulk operations (`/memsy:memsy-checkpoint`, `/memsy:memsy-index`) always confirm regardless. Accepts truthy variants: `on`/`true`/`1`/`yes`/`enabled`. |

Full env reference: [`../../mcp/README.md`](../../mcp/README.md).

## Uninstall

```sh
claude plugin uninstall memsy
```

The MCP server (`@memsy-io/mcp`) is unaffected — uninstalling the plugin only removes the slash commands and hooks, not the MCP. The MCP keeps working in any other host where you've configured it.

## Troubleshooting

**`/memsy:memsy-doctor` (or `/memsy doctor`) says "Status: ❌" or the command doesn't appear**

- Confirm `MEMSY_API_KEY` is set in the shell that launched Claude Code: `echo $MEMSY_API_KEY`
- Restart Claude Code — MCP servers are loaded at startup.
- Run `./install.sh` from this directory; it prints any prerequisite issues.

**Plugin can't find `@memsy-io/mcp`**

- Make sure `npx` is on PATH (comes with Node).
- Try `npx -y @memsy-io/mcp --version` to confirm the MCP server can run.
- If you're on a corporate network blocking npm, run `./install.sh --dev /path/to/local/memsy` and point at a local build.

**Wrong org's memories surfacing**

- Run `/memsy switch <profile>` (smart router) or `/memsy:memsy-org <profile>` (namespaced) to switch active profile, or set `MEMSY_PROFILE` in your shell and restart Claude Code.
- For now, you can also set `MEMSY_API_KEY` to the key of the org you want to use.
