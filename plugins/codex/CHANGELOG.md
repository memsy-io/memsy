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
- Opt-in **turn sync** (`MEMSY_TURN_SYNC=on`): the `UserPromptSubmit` + `Stop` hooks pair each user prompt with the assistant reply and POST both to `/ingest`, with the API key resolved from the environment or `~/.memsy/config.json` and an `actor_id` derivation that matches the MCP server.
- Opt-in **proactive capture** (`MEMSY_PROACTIVE=on`) and **confirm-before-store** (`MEMSY_CONFIRM_STORE=on`) modes, each labelling a memory's `kind` by speaker (`user_message` vs `assistant_message`).
- **First-run onboarding nudge**: a one-time, network-free pointer to default setup when no roles/teams are configured.
- **Interactive API-key setup** in `install.sh`: prompts for the key (input is not echoed) and writes `~/.memsy/config.json` at mode `0600`.
- Multi-org switching via `memsy_list_orgs` / `memsy_use_org`.
- Marketplace entry and the Codex documentation page.

[Unreleased]: https://github.com/memsy-io/memsy/commits/main/plugins/codex
[0.1.0]: https://github.com/memsy-io/memsy/tree/main/plugins/codex
