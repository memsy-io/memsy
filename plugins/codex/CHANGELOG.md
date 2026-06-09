# Changelog

All notable changes to the Memsy plugin for Codex CLI are documented here.
This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Codex serves the plugin from the marketplace's Git snapshot (pinned to `main`),
so updates ship when changes land on `main` — there is no version-keyed update.
This changelog documents notable changes for reference; see the README's
[Updating](./README.md#updating) section for how users receive them.

## [Unreleased]

## [0.1.0]

### Added
- Initial release: `memsy-recall` and `memsy-remember` skills over the `@memsy-io/mcp` server.
- Opt-in **session-start auto-context** (`MEMSY_SESSION_AUTOCONTEXT=on`) that surfaces recent memories via the JSON envelope Codex's SessionStart hook requires.
- Opt-in **turn sync** (`MEMSY_TURN_SYNC=on`): the `UserPromptSubmit` + `Stop` hooks pair each user prompt with the assistant reply and POST both to `/ingest`. The API key, `base_url`, `actor_id`, profile, and default role/team are resolved from the shell env, `~/.codex/config.toml` `[mcp_servers.memsy.env]`, then `~/.memsy/config.json` — keeping the hook aligned with the MCP server's curated env. A single default role/team is auto-attached (mirroring the MCP's ingest behaviour), and the `actor_id` derivation matches `mcp/src/identity.ts`. The pending-prompt stash is written `0600` and swept after a 6h TTL so a killed turn can't leak or mis-pair prompts.
- Opt-in **proactive capture** (`MEMSY_PROACTIVE=on`) and **confirm-before-store** (`MEMSY_CONFIRM_STORE=on`) modes, each labelling a memory's `kind` by speaker (`user_message` vs `assistant_message`).
- **First-run onboarding nudge**: a one-time, network-free pointer to default setup when no roles/teams are configured. It fires only on a genuine session start (not on mid-session `compact`) and resolves config with whole-file precedence from the session cwd.
- Session-start auto-context is likewise suppressed on `compact` (it re-injects a "first message of the session" instruction), while the mode/proactive blocks are re-asserted so a compacted transcript keeps them.
- **Interactive API-key setup** in `install.sh`: prompts for the key (input is not echoed) and writes `~/.memsy/config.json` at mode `0600`. Re-running the installer is idempotent — an already-configured marketplace/plugin no longer aborts the key prompt.
- Multi-org switching via `memsy_list_orgs` / `memsy_use_org`.
- Marketplace entry and the Codex documentation page, including a **Hook trust** note (Codex skips plugin hooks until trusted via `/hooks`, and re-flags them after updates).

[Unreleased]: https://github.com/memsy-io/memsy/commits/main/plugins/codex
[0.1.0]: https://github.com/memsy-io/memsy/tree/main/plugins/codex
