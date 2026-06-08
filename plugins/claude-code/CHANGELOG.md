# Changelog

All notable changes to the Memsy plugin for Claude Code are documented here.
This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Turn sync** (`MEMSY_TURN_SYNC=on`): a `Stop` hook ships the last user + assistant turn to `/ingest` after each response. The API key resolves from the environment or the active profile in `~/.memsy/config.json`, and the `actor_id` derivation matches the MCP server so captured memories surface in recall. Failures are logged to `~/.memsy/turn-sync.log`.
- **Interactive API-key setup** in `install.sh`: prompts for the key (input is not echoed) and writes `~/.memsy/config.json` at mode `0600`.
- **First-run onboarding nudge**: a one-time, network-free pointer to default setup when no roles/teams are configured.
- **`tests/identity-parity.sh`**: asserts the Node and Python `actor_id` derivations produce identical values across several vectors.
- **`scripts/release.sh`**: bumps the plugin version in the manifest and the marketplace entry in lockstep.
- **Updating** instructions in the README.

### Changed
- Proactive capture and the checkpoint/remember flows now label each memory's `kind` by speaker (`user_message` vs `assistant_message`) instead of always using `user_message`.
- Corrected the documented MCP-prompt invocation form to `/plugin:memsy:memsy:<name>`.

### Fixed
- Turn sync previously read the API key from the environment only and did nothing when the key lived solely in `~/.memsy/config.json`.
- The onboarding nudge now resolves a single active config (a per-project `.memsy/config.json` is used exclusively when present) instead of mixing project and global defaults.
- `post-response.sh` now reads the transcript from the tail in blocks and stops at the last turn, instead of loading the whole file on every response.

## [0.1.0]

### Added
- Initial release: the `/memsy` universal entry point and `/memsy:memsy-*` slash commands; recall, remember, and setup skills; opt-in session-start auto-context; codebase indexing (`/memsy:memsy-index`); session checkpointing (`/memsy:memsy-checkpoint`); multi-org switching; and a deep-retrieval subagent — all over the `@memsy-io/mcp` server.

[Unreleased]: https://github.com/memsy-io/memsy/commits/main/plugins/claude-code
