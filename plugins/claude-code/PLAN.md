# Claude Code Plugin — Phase 1b Plan

**Status**: ALL MILESTONES COMPLETE (v0.4.0) · **Branch**: `ns/claude-code-plugin-m1` · **Package**: `@memsy-io/claude-code` (private for now)

## Goal

Wrap `@memsy-io/mcp` with Claude Code-specific UX so:

- One-command install (`/plugin install ...`).
- Slash commands give discoverable entry points (`/memsy`, `/memsy-doctor`, `/memsy-setup`).
- Skills make recall + store fire reliably on natural phrasing.
- Hooks add session-start auto-context and session-end capture (default OFF until telemetry justifies).
- A subagent handles deep multi-step retrieval.

Plugin is **strictly additive** on top of the MCP — uninstalling it must leave the MCP working unchanged.

## Strategic positioning

| Layer | Provides | Hosts |
|---|---|---|
| `@memsy-io/mcp` | Tools, resources, prompts | Claude Code, Cursor, VS Code, Cline, Continue, Zed |
| `@memsy-io/claude-code` | Slash commands, skills, hooks, subagents | **Claude Code only** |

**Rule**: plugin scripts never call the Memsy API directly. Every operation goes through MCP tools. (Supermemory's plugin violates this — their `.cjs` scripts hit the API directly, locking them to Claude Code. We don't repeat that.)

## Dependency state

| Dep | Status today | Blocker for |
|---|---|---|
| PR #19 merged | ❌ | Nothing — we can scaffold the plugin against the local MCP build first |
| `@memsy-io/mcp` on npm | ❌ | Public install (M1 release) — until then, plugin's `mcpServers.memsy` block points at `node /abs/path/dist/server.js` for dev |
| `claude plugin install github:...` subpath support | unverified | M1 install UX — fallback is `npx`-style install or manual JSON paste |

## Milestones (revised after Supermemory research)

| M | Deliverable | Effort | Default state | Status |
|---|---|---|---|---|
| M1 | `plugin.json` + `/memsy-doctor` command + `install.sh` + README | ½ day | always-on | ✅ v0.1.0 |
| M2 | `/memsy`, `/memsy-remember`, `/memsy-org`, `/memsy-setup` slash commands (thin wrappers over MCP tools) | ½ day | always-on | ✅ v0.2.0 |
| M3 | `memsy-recall` + `memsy-remember` + `memsy-setup` (fallback) skills | 1 day | always-on (skills are triggered by phrasing, not auto-fired) | ✅ v0.2.0 |
| M4 | `hooks/hooks.json` + `scripts/session-start.sh` — SessionStart auto-context | 1 day | **OFF** — opt-in via `MEMSY_SESSION_AUTOCONTEXT=on` | ✅ v0.4.0 |
| M5 | `/memsy-checkpoint` command (not a hook — see note below) | 1 day | manual invoke | ✅ v0.4.0 |
| M6 | `/memsy-index` command — codebase ingest per-ecosystem playbook | 1 day | manual invoke | ✅ v0.4.0 |
| M7 | `memsy-archivist` subagent — deep retrieval / cluster / dedupe | ½ day | manual invoke | ✅ v0.4.0 |
| M8 | Docs page (`docs/content/docs/claude-code.mdx`) + meta.json registration | ½ day | — | ✅ v0.4.0 |

### M5 design change — hook → command

The original plan called for a `Stop` or `SessionEnd` hook that would scan the conversation and auto-store qualifying content. **This doesn't work** in Claude Code: per the [hooks reference](https://code.claude.com/docs/en/hooks), stdout from `Stop` and `SessionEnd` hooks goes to the debug log only — it is NOT injected into Claude's context. An auto-save hook therefore couldn't actually call MCP tools to store anything.

We shipped `/memsy-checkpoint` as a user-initiated slash command instead. Same intent (capture session learnings), strictly better trade-offs:

- **Safer**: no surprise noise from over-eager auto-store.
- **Functional**: the command body runs through Claude, so it can actually call `memsy_ingest`.
- **Reviewable**: the user sees the candidate list before anything is persisted.
- **Re-usable**: works at any point in the session, not just at termination.

Hook stdout *is* injected for `SessionStart`, `UserPromptSubmit`, and `UserPromptExpansion`. That's the discriminator — M4 SessionStart auto-context works as a hook because its stdout reaches Claude. M5 doesn't, so it can't.

**Total**: ~6 working days. Cut lines below.

## Cut lines (versioned releases)

| Release | Includes | Value |
|---|---|---|
| `claude-code-v0.1.0` | M1 + M2 | One-command install, slash commands discover the surface. Low risk. |
| `claude-code-v0.2.0` | M3 | Natural-phrase recall + remember. The high-value leap. |
| `claude-code-v0.3.0` | M4 + M5 | Auto-context + auto-store, both opt-in. Where noise risk lives. |
| `claude-code-v0.4.0` | M6 + M7 + M8 | Polish, codebase indexing, deep retrieval, docs. |

## Dev/prod MCP path strategy

`plugin.json` ships with a production-ready entry pointing at npm:

```jsonc
{
  "mcpServers": {
    "memsy": {
      "command": "npx",
      "args": ["-y", "@memsy-io/mcp"]
    }
  }
}
```

For local dev, `install.sh` accepts a `--dev` flag that rewrites the entry to:

```jsonc
{
  "mcpServers": {
    "memsy": {
      "command": "node",
      "args": ["<absolute-path-to-monorepo>/mcp/dist/server.js"]
    }
  }
}
```

Detected via env var `MEMSY_DEV_PLUGIN_MCP_PATH`. Falls back to npm when unset. Same plugin tarball, two install modes.

## File layout

Per the [Claude Code plugin spec](https://code.claude.com/docs/en/plugins-reference): manifest goes under `.claude-plugin/`, MCP config is a separate `.mcp.json` at the plugin root, components live in well-known sibling dirs.

```
memsy/                               # monorepo root
├── .claude-plugin/
│   └── marketplace.json             # M1 — exposes the plugin for `claude marketplace add memsy-io/memsy`
└── plugins/claude-code/
    ├── PLAN.md                      # this file
    ├── .claude-plugin/
    │   └── plugin.json              # M1 — plugin manifest (name, version, metadata)
    ├── .mcp.json                    # M1 — declares the memsy MCP server (defaults to npx @memsy-io/mcp)
    ├── README.md                    # M1 — install + verify + troubleshooting
    ├── install.sh                   # M1 — Node check + --dev/--prod .mcp.json swap
    ├── package.json                 # M1 — metadata for eventual npm publish
    ├── commands/
    │   ├── memsy-doctor.md          # M1 — health + identity diagnostics
    │   ├── memsy.md                 # M2 — natural search
    │   ├── memsy-org.md             # M2 — switch profile
    │   └── memsy-setup.md           # M2 — invokes setup-defaults prompt
    ├── skills/                      # M3
    │   ├── memsy-recall/SKILL.md
    │   └── memsy-remember/SKILL.md
    ├── hooks/                       # M4, M5
    │   └── hooks.json               # event matchers → command/mcp_tool actions
    ├── agents/                      # M7
    │   └── memsy-archivist.md
    └── scripts/                     # M6 — supporting code for /memsy-index playbook
        └── (TBD)
```

## M1 spec (delivered in this branch)

### Files
1. **`.claude-plugin/plugin.json`** — plugin manifest: `name`, `displayName`, `version: 0.1.0`, `description`, author/homepage/repo/license, keywords. MCP config is **not** in this file (it lives in `.mcp.json`).
2. **`.mcp.json`** — declares the `memsy` MCP server. Default points at `npx -y @memsy-io/mcp`. `install.sh --dev` rewrites it to `node <abs>/mcp/dist/server.js`.
3. **`commands/memsy-doctor.md`** — slash-command markdown with `description` frontmatter. Body tells Claude to call `memsy_health`, read `memsy://actor/current` + `memsy://profile/current`, then print a tidy summary (Status / Base URL / Profile / Actor / Session) plus the resource's `setup_hint` when present.
4. **`install.sh`** — POSIX bash:
   - Detect Node 18+; fail with clear message otherwise.
   - `./install.sh` → print prerequisites + next steps.
   - `./install.sh --dev <monorepo-path>` → rewrite `.mcp.json` to `node <abs>/mcp/dist/server.js`.
   - `./install.sh --prod` → restore `.mcp.json` to `npx @memsy-io/mcp`.
5. **`README.md`** — install via `claude marketplace add` + `claude plugin install`, dev install via `--dev`, verify via `/memsy-doctor`, env reference, troubleshooting.
6. **`package.json`** — name `@memsy-io/claude-code`, version `0.1.0`, `private: true` for now, files whitelist.
7. **`../../.claude-plugin/marketplace.json`** (monorepo root) — single-entry marketplace pointing at `./plugins/claude-code`, so the plugin is `claude plugin install`-able without npm.

### Acceptance criteria
- On a clean machine: install the plugin → restart Claude Code → `/memsy-doctor` returns green (status: ok, version, base_url, actor_id with source).
- Uninstall the plugin → MCP still works directly (no leaked dependencies).
- `install.sh --dev /path/to/memsy` swaps the MCP path in `plugin.json` and `/memsy-doctor` still works against the local build.

## Open questions

| # | Question | Blocks |
|---|---|---|
| 1 | Does Claude Code support `github:org/repo/subpath` install for monorepo subdirs? | M1 install UX (fallback: publish to npm and `npx`) |
| 2 | Plugin marketplace listing — needed for `/plugin install` discovery? Or is GitHub-direct sufficient? | M1 polish |
| 3 | Hot-reload story — does Claude Code re-read `plugin.json` mid-session, or restart-only? | M3+ dev velocity |
| 4 | SessionStart token budget — start at 1.5K / 6 memories, instrument before tuning | M4 default |
| 5 | Signal keywords for M5 — borrow Supermemory's set (`remember, architecture, decision, bug, fix`) or curate? | M5 first-pass |
| 6 | How to detect "this is a Claude Code MCP session" inside the MCP for telemetry? Custom user-agent? | M8 |

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Claude Code plugin spec changes mid-development | Pin to current spec, document version, watch release notes |
| 2 | Skill trigger fuzziness — `memsy-recall` fires too often or not enough | A/B-test trigger strings, conservative defaults, easy disable |
| 3 | SessionStart hook adds latency to every chat start | Hard timeout (1.5s), fail silently, default OFF |
| 4 | Auto-store noise erodes trust | Default OFF, signal-keyword gate, `safe_to_delete: true` metadata so cleanup is easy |
| 5 | Plugin + MCP version skew | Plugin's `plugin.json` pins `memsyMcpMin`; `install.sh` verifies via `memsy_health` |

## What we're NOT building in Phase 1b

- VS Code / Cursor / Cline native plugins → Phase 2.
- `memsy auth login` device-code flow → tracked separately; plugin uses copy-paste key for now.
- Multi-org *per-host* automation → user picks profile manually via `/memsy-org`.
- Memory dashboard inside Claude Code → use app.memsy.io.

## Next action (when you greenlight)

**M1 commit set** in a new branch `ns/claude-code-plugin-m1` off `main` (or off `ns/mcp-server` if you want to bundle):

1. `feat(plugin): scaffold @memsy-io/claude-code with plugin.json + memsy-doctor`
2. `feat(plugin): install.sh with --dev local-MCP swap`
3. `docs(plugin): README + verify steps`

Plus a manual e2e on a fresh Claude Code profile.
