# Changelog

All notable changes to the Memsy memory provider for Hermes are documented
here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The provider is installed as a copied snapshot (`./install.sh` →
`~/.hermes/plugins/memsy/`); users receive changes by pulling the repo and
re-running the installer — see the README's [Updating](./README.md#updating)
section.

## [Unreleased]

## [0.2.0] - 2026-09-17

### Fixed
- **Turns are now filed under the conversation Hermes names on the call, not the
  one captured at `initialize()`.** Hermes passes `session_id` to `sync_turn()`
  on every turn — it would not do that if the value never changed — but the
  provider ignored it and reused the id from startup. A conversation that
  changed mid-run therefore kept being stored under the name it began with. The
  per-call id now wins, falling back to the `initialize()` value when absent.

- **The empty-`session_id` fallback is no longer a shared constant.** It was the
  literal string `hermes-session`, so every conversation that hit it — across
  every user and deployment — was stored under one id and merged into a single
  apparent conversation. It is now `hermes-<uuid4>`, unique per process. This
  was invisible while nothing filtered by conversation; now that search can be
  scoped, it would have meant asking for "this conversation" and receiving a
  stranger's turns.

### Added
- **`_search_body()` can scope a search to one conversation** via an optional
  `session_id`. **Off by default and unused by any caller**, deliberately:
  connector-sourced memories (Drive, Slack, GitHub, Notion, S3, OneDrive) each
  carry their own container id as a conversation, so a chat-scoped search
  excludes all of them plus every earlier conversation. Enabling it for
  `prefetch()`, which runs before every LLM call, would quietly shrink what the
  model can recall — a product decision, not a default. Mirrors the MCP's
  `scope` parameter, which is likewise unscoped by default.

  Requires a Memsy server with conversation-scoped search; against an older one
  the field is dropped and the search runs unfiltered.

## [0.1.0]

### Added
- Initial release: `MemsyMemoryProvider` registered as Hermes's native memory
  backend (no MCP subprocess) with lifecycle hooks — `prefetch` (inject relevant
  memories before each LLM call), `queue_prefetch` (cache pre-warm), `sync_turn`
  (persist each user+assistant turn, non-blocking), `on_pre_compress` (save
  insights before context discard), `on_memory_write` (mirror Hermes built-in
  memory writes), `on_session_end` / `shutdown` (flush pending sync).
- Native tools: `memsy_search`, `memsy_ingest`, `memsy_health`,
  `memsy_list_memories` (defaults to the **active actor**; `all_actors: true`
  for org-wide), `memsy_list_roles` / `memsy_create_role`, `memsy_list_teams` /
  `memsy_create_team`, and `memsy_set_defaults` (persists to the shared
  `~/.memsy/config.json`).
- `actor_id` derivation matches the MCP server (`mcp/src/identity.ts`):
  `MEMSY_ACTOR_ID` env → pinned profile `actor_id` → `sha256(profile|git-email)`
  → `sha256(profile|user@host)`; whole-file config precedence (a per-project
  `.memsy/config.json` is used exclusively when present).
- Single-default role/team auto-attribution on ingest and default role/team
  filters on search, mirroring the MCP's semantics.
- Config writes (`save_config`, `memsy_set_defaults`) are atomic
  (tmp + rename) and `chmod 0600` — both files can carry the API key.
- `hermes memsy status` / `hermes memsy config` CLI helpers and the Hermes
  documentation page.

[Unreleased]: https://github.com/memsy-io/memsy/commits/main/plugins/hermes
[0.1.0]: https://github.com/memsy-io/memsy/tree/main/plugins/hermes
