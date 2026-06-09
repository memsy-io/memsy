# Changelog

All notable changes to the Memsy memory provider for Hermes are documented
here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The provider is installed as a copied snapshot (`./install.sh` →
`~/.hermes/plugins/memsy/`); users receive changes by pulling the repo and
re-running the installer — see the README's [Updating](./README.md#updating)
section.

## [Unreleased]

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
