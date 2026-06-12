# Changelog

All notable changes to the Memsy plugin for OpenClaw are documented here.
This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The plugin is built from source and installed as a copy; users receive changes
by pulling the repo and re-running `./install.sh` — see the README's
[Updating](./README.md#updating) section.

## [Unreleased]

## [0.1.0]

### Added
- Initial release: a native OpenClaw TypeScript plugin registering the Memsy
  tools — `memsy_search`, `memsy_ingest`, `memsy_health`,
  `memsy_list_memories` (defaults to the **active actor**; `all_actors: true`
  for org-wide), `memsy_list_orgs` / `memsy_use_org`, `memsy_list_roles` /
  `memsy_create_role`, `memsy_list_teams` / `memsy_create_team`, and
  `memsy_set_defaults` (persisted atomically, `0600`, to the shared
  `~/.memsy/config.json`).
- `memsy-recall` and `memsy-remember` skills (installed globally via
  `openclaw skills install`).
- Opt-in **session auto-context** (`MEMSY_SESSION_AUTOCONTEXT=on`): recent
  memories for the active actor are prepended once per session via the
  heartbeat prompt contribution.
- Opt-in **proactive capture** (`MEMSY_PROACTIVE=on`) with speaker-correct
  `kind` labels, and **confirm-before-store** (`MEMSY_CONFIRM_STORE=on`) —
  the `[memsy modes: …]` line is emitted independently of proactive, so
  confirm-before-store works on its own.
- `actor_id` derivation matches the MCP server (`mcp/src/identity.ts`):
  `MEMSY_ACTOR_ID` env → pinned profile `actor_id` → `sha256(profile|git-email)`
  → `sha256(profile|user@host)`. The git email is read from git's config
  **files** directly (global scope first, then the repo's `.git/config`,
  worktree-aware) instead of spawning `git` — OpenClaw's plugin security
  scanner blocks any plugin importing the Node subprocess module, which would
  make the install fail outright; whole-file config precedence (a per-project
  `.memsy/config.json` is used exclusively when present); single-default
  role/team auto-attribution on ingest and default role/team filters on search.
- `install.sh` builds from source, registers the plugin + skills, and offers
  interactive API-key setup (input is not echoed; `~/.openclaw/.env` is locked
  to `0600` before the key is written). It also detects a restrictive
  `tools.profile` (OpenClaw's default `"coding"` profile filters plugin-owned
  tools out of the agent's toolset) and adds `"memsy_*"` to `tools.allow` when
  it can do so without clobbering existing entries.
- Marketplace entry and the OpenClaw documentation page.
- All HTTP calls go through one `memsyFetch` helper: every request is bounded
  by a 10s timeout (a hung fetch inside the gateway's heartbeat hook would
  stall the agent turn forever), and error bodies are read as text first so a
  proxy's non-JSON 502 page surfaces as the real status instead of a
  `SyntaxError`.
- Session auto-context reads the `items` field `/console/memories` actually
  returns (it previously read a nonexistent `memories` field and always came
  back empty); the proactive instruction spells out that `memsy_ingest`'s
  `metadata` parameter is a JSON **string**, not an object; ingest bounds
  mirror the MCP (1–100 events, non-empty content, ≤4096-char metadata).
- `memsy_list_orgs` lists every profile in the shared config (not just the
  active one), and `memsy_use_org` prints a working restart command
  (`openclaw chat` — there is no `openclaw start`).

[Unreleased]: https://github.com/memsy-io/memsy/commits/main/plugins/openclaw
[0.1.0]: https://github.com/memsy-io/memsy/tree/main/plugins/openclaw
