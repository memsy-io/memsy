# Memsy for Claude Code

Long-term memory for Claude Code — recall, store, and share decisions across sessions, hosts, and teammates.

This plugin wraps [`@memsy-io/mcp`](https://www.npmjs.com/package/@memsy-io/mcp) with Claude Code-native UX. The MCP server provides all the tools and resources; this plugin adds slash commands, skills, and hooks so the surface is discoverable from inside Claude Code.

> **Status: v0.1.0 — all milestones**
> Slash commands, skills, opt-in `SessionStart` auto-context, `/memsy-checkpoint` for save-the-conversation, `/memsy-index` for codebase snapshotting, `memsy-archivist` subagent for deep retrieval, and a full docs page at <https://docs.memsy.io/docs/claude-code>.

## Install

1. **Get an API key** at <https://app.memsy.io>.
2. **Provide the key** — either way works (Claude Code passes the launching shell's env to the MCP server, [confirmed in the docs](https://code.claude.com/docs/en/mcp)):
   - **Export it** in the shell that launches Claude Code (add to `~/.zshrc` / `~/.bashrc` to persist):
     ```sh
     export MEMSY_API_KEY=msy_...
     ```
   - **Or, if you cloned the repo, run `./install.sh`** — it prompts for the key and saves it to `~/.memsy/config.json` (`chmod 600`). The MCP reads it from there, so no re-export is needed, and the same file is shared with other MCP hosts (Cursor, Codex).
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

## Updating

When a new version is published, update from inside Claude Code or the CLI:

```sh
# Refresh the marketplace catalog, then update the plugin
claude plugin marketplace update memsy
claude plugin update memsy@memsy
```

Or use the interactive picker — run `/plugin`, open the **Plugins** tab, select **memsy**, and choose update.

**Auto-update (optional):** Claude Code can keep the plugin current for you. Run `/plugin`, open the **Marketplaces** tab, select **memsy**, and choose **Enable auto-update** — Claude Code will then refresh the marketplace and update the plugin at startup. (Auto-update is opt-in for third-party marketplaces; it's off until you enable it.)

After any update, restart Claude Code so the refreshed plugin and its MCP server load, then run `/memsy:memsy-doctor` to confirm.

## Local development

If you're iterating on the MCP server itself (`memsy/mcp/`), point the plugin at your local build:

```sh
# 1. Build the MCP
cd /path/to/memsy/mcp
npm install && npm run build

# 2. Rewrite the plugin's .mcp.json to use the local build
cd /path/to/memsy/plugins/claude-code
./install.sh --dev /path/to/memsy

# 3. Restart Claude Code
```

To switch back to the published npm version:

```sh
./install.sh --prod
```

## Releasing (maintainers)

This plugin uses explicit [semantic versioning](https://semver.org). Claude Code keys plugin updates off the `version` field, so **users only receive changes after you bump it** — pushing commits alone is not enough (`/plugin update` reports "already at the latest version" until the number changes).

To cut a release:

1. **Bump the version** — `scripts/release.sh` updates `.claude-plugin/plugin.json` and the marketplace entry in lockstep:
   ```sh
   ./scripts/release.sh patch     # bug fixes      0.1.0 → 0.1.1
   ./scripts/release.sh minor     # new features   0.1.0 → 0.2.0
   ./scripts/release.sh major     # breaking       0.1.0 → 1.0.0
   ./scripts/release.sh 1.4.2     # or an explicit version
   ./scripts/release.sh patch --commit   # also stage + commit the bump
   ```
2. **Update `CHANGELOG.md`** — move the `Unreleased` notes under the new version heading.
3. **Commit and push to `main`.** The plugin source is served from the default branch, so changes reach users only once they land on `main`.

Users then pull the release with `claude plugin update memsy@memsy` (see [Updating](#updating)).

> **The version must change for an update to be delivered.** If instead you want every commit to ship automatically, omit `version` from both the manifest and the marketplace entry — Claude Code then uses the git commit SHA as the version. Explicit semver is recommended for a published plugin.

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
/memsy proactive on  | /memsy proactive off          → toggle auto-save (session)
/memsy confirm on    | /memsy confirm off            → toggle ask-before-save
/memsy modes                                         → show current mode state
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

### Turn sync (opt-in)

When `MEMSY_TURN_SYNC=on` is set in the shell that launches Claude Code, the plugin's `Stop` hook ships the last user+assistant turn to Memsy after every response. The extraction pipeline decides what's worth keeping — no "remember that" needed, and nothing for Claude to judge mid-turn.

Claude Code's `Stop`/`SessionEnd` hooks don't pipe their stdout back into Claude, so the hook **can't** call MCP tools to store anything. Instead it POSTs the turn directly to `/ingest` over HTTPS (the hook is registered `async`, so zero latency is added to your responses). Failures are logged to `~/.memsy/turn-sync.log`.

| Env var | Default | Purpose |
|---|---|---|
| `MEMSY_TURN_SYNC` | `off` | Set to `on` to capture every turn automatically. |

> **Identity alignment.** Turn sync tags each event with the same `actor_id` that `memsy_search` reads, so captured memories surface in recall. The hook mirrors the MCP's **full** derivation ladder (`mcp/src/identity.ts`): `MEMSY_ACTOR_ID` env if set → the active profile's `actor_id` pinned in `~/.memsy/config.json` (this is what `/memsy:memsy-setup` writes) → `sha256("<profile>|<git-email>")` → `sha256("<profile>|<user>@<host>")`. The profile name resolves `MEMSY_PROFILE` env → the config file's `active_profile` → `default`, identically on both sides — so a profile selected via `active_profile` (not the env var) **and** a pinned `actor_id` both stay aligned with no extra setup. Edge case: if you have *no* git `user.email` configured at all, the OS-username fallback can differ between the Node MCP and the Python hook — set `MEMSY_ACTOR_ID` to pin both.

### First-run setup (onboarding)

The first time you start a session without default roles/teams configured, the `SessionStart` hook emits a **one-time** nudge offering to set them up. It's gentle and self-suppressing — it writes `~/.memsy/.onboard-nudged` after the first show and never repeats, and it stays silent once any defaults exist (or `MEMSY_DEFAULT_ROLE_IDS`/`MEMSY_DEFAULT_TEAM_IDS` is set). The check is purely local (`~/.memsy/config.json`); no network call on session start.

To run setup anytime — it surfaces the roles/teams your org already has, or offers to create them, then persists your chosen defaults:

```
/memsy:memsy-setup
```

(or just ask: *"set up my memsy defaults"*). Defaults are optional — memory works fine without them; roles/teams sharpen recall and attribution.

## Subagents

| Agent | Trigger | Purpose |
|---|---|---|
| `memsy-archivist` | Explicit invocation via Task tool, or when you ask "do a deep memsy dive on X" / "audit all our past decisions on X" | Multi-query exploration — runs 3–5 query variants in parallel, clusters by theme, dedupes, returns structured summary with explicit gap-list. (Subagents are invoked explicitly; they do not auto-fire from description matching.) |

### MCP-level prompts (also available in Cursor, VS Code, Cline, etc.)

These are exposed by the `@memsy-io/mcp` server itself, so they work in any MCP host:

In Claude Code they're invoked with the `/plugin:<plugin>:<server>:<prompt>` form (other MCP hosts surface them under their own prompt menus):

| Prompt | Description |
|---|---|
| `/plugin:memsy:memsy:recall-context` | Structured recall — Claude Code prompts you for `topic` + `limit` |
| `/plugin:memsy:memsy:proactive-mode` | Switch the session into proactive recall mode |
| `/plugin:memsy:memsy:setup-defaults` | Same flow as the `/memsy:memsy-setup` command |
| `/plugin:memsy:memsy:summarize-and-store` | Summarize recent turns into a single memory and store it |

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
| `MEMSY_TURN_SYNC` | `on` to auto-capture every user+assistant turn via the `Stop` hook (POSTs to `/ingest` over HTTPS). Default: `off`. The hook reads the active profile's `active_profile` + pinned `actor_id` from `~/.memsy/config.json`, so captured memories stay aligned with recall automatically — no need to set `MEMSY_ACTOR_ID` (except the no-git-email edge case; see Turn sync above). Accepts `on`/`true`/`1`/`yes`/`enabled`. |
| `MEMSY_CONFIRM_STORE` | `on` to require confirmation before every single-item memory store (`/memsy:memsy-remember`, the `memsy-remember` auto-fire skill, and the `/memsy remember` smart-router branch). Default: `off` (stores directly — deliberate slash invocation implies intent). Bulk operations (`/memsy:memsy-checkpoint`, `/memsy:memsy-index`) always confirm regardless. Accepts truthy variants: `on`/`true`/`1`/`yes`/`enabled`. |
| `MEMSY_PROACTIVE` | `on` to make Claude actively watch the conversation for save-worthy content — preferences, intents, plans, decisions, learnings — and store them via `memsy_ingest` **without** requiring explicit save verbs like "remember that". This is the equivalent of running `/memsy:proactive-mode` once per session, but turned into the default behavior. Combine with `MEMSY_CONFIRM_STORE=on` to get "watch + ask before storing each one." Default: `off` (conservative — only explicit save verbs / slash invocations / `/memsy-checkpoint` save). Accepts the same truthy variants. |

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
