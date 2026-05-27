# Memsy for Claude Code

Long-term memory for Claude Code — recall, store, and share decisions across sessions, hosts, and teammates.

This plugin wraps [`@memsy-io/mcp`](https://www.npmjs.com/package/@memsy-io/mcp) with Claude Code-native UX. The MCP server provides all the tools and resources; this plugin adds slash commands, skills, and hooks so the surface is discoverable from inside Claude Code.

> **Status: v0.1.0 — M1**
> Slash command: `/memsy-doctor` (health + identity check). Skills, auto-context, and capture hooks land in v0.2.0+. See [PLAN.md](./PLAN.md) for the full roadmap.

## Install

1. **Get an API key** at <https://app.memsy.io>.
2. **Set it in your shell** (e.g. `~/.zshrc` / `~/.bashrc`):
   ```sh
   export MEMSY_API_KEY=msy_...
   ```
3. **Add the Memsy marketplace + install the plugin:**
   ```sh
   claude marketplace add memsy-io/memsy
   claude plugin install memsy@memsy
   ```
4. **Restart Claude Code** so it loads the plugin's MCP server.
5. **Verify:**
   ```
   /memsy-doctor
   ```
   You should see a "Status: ok" block with your active profile and `actor_id`.

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

## Commands

| Command | Since | Description |
|---|---|---|
| `/memsy-doctor` | v0.1.0 | Check MCP health, identity source, active profile, and session id |
| `/memsy` | v0.1.0 (planned) | Natural-language memory search |
| `/memsy-org` | v0.1.0 (planned) | Switch active profile / org |
| `/memsy-setup` | v0.1.0 (planned) | Walkthrough to pin `actor_id`, set default roles/teams |

## Environment

| Var | Purpose |
|---|---|
| `MEMSY_API_KEY` | **Required.** Your `msy_...` key. |
| `MEMSY_BASE_URL` | Override API endpoint (default: `https://api.memsy.io/v1`). |
| `MEMSY_PROFILE` | Select a named profile from `~/.memsy/config.json`. |
| `MEMSY_ACTOR_ID` | Pin a stable `actor_id` (otherwise it's derived from `git config user.email` or `$USER@hostname`). |
| `MEMSY_DEFAULT_ROLE_IDS` | Comma-separated default role filters for searches. |
| `MEMSY_DEFAULT_TEAM_IDS` | Comma-separated default team filters for searches. |

Full env reference: [`../../mcp/README.md`](../../mcp/README.md).

## Uninstall

```sh
claude plugin uninstall memsy
```

The MCP server (`@memsy-io/mcp`) is unaffected — uninstalling the plugin only removes the slash commands and hooks, not the MCP. The MCP keeps working in any other host where you've configured it.

## Troubleshooting

**`/memsy-doctor` says "Status: ❌" or the command doesn't appear**

- Confirm `MEMSY_API_KEY` is set in the shell that launched Claude Code: `echo $MEMSY_API_KEY`
- Restart Claude Code — MCP servers are loaded at startup.
- Run `./install.sh` from this directory; it prints any prerequisite issues.

**Plugin can't find `@memsy-io/mcp`**

- Make sure `npx` is on PATH (comes with Node).
- Try `npx -y @memsy-io/mcp --version` to confirm the MCP server can run.
- If you're on a corporate network blocking npm, run `./install.sh --dev /path/to/local/memsy` and point at a local build.

**Wrong org's memories surfacing**

- Run `/memsy-org` (coming in v0.2.0) or set `MEMSY_PROFILE` in your shell.
- For now, you can also set `MEMSY_API_KEY` to the key of the org you want to use.
