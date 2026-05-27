---
description: Ingest a structured snapshot of the current codebase into Memsy — so search can answer "how is this project laid out" later
---

The user wants to seed Memsy with a structured summary of the current project. This is a one-shot manual ingest — not a continuous sync. Re-run it when the architecture meaningfully changes.

## 1. Detect the ecosystem

Look for marker files in the current working directory (in order; first match wins):

| Marker file | Ecosystem | What to read |
|---|---|---|
| `package.json` | JS / TS | `name`, `description`, `dependencies`, `scripts.build`/`scripts.test`, `workspaces` |
| `pyproject.toml` | Python | `[project].name`/`description`, dependencies, top-level packages |
| `Cargo.toml` | Rust | `[package].name`/`description`, dependencies, workspace members |
| `go.mod` | Go | module path, Go version, top-level dependencies |
| `Gemfile` | Ruby | gems listed (top-level only) |
| `pom.xml` / `build.gradle` | JVM | project name, dependencies |
| none of the above | mixed / unknown | skip to step 3 |

If multiple markers exist (e.g. a monorepo with both `package.json` and `pyproject.toml`), treat each as a sub-project and process all of them.

## 2. Read README + top-level structure

For each detected project:

- Read `README.md` (or `README.rst`) — extract the one-paragraph project description from the top.
- Run `ls` at the project root, filter to source directories (skip `node_modules`, `.git`, `dist`, `build`, `target`, `__pycache__`, `.venv`, `vendor`).
- For each source dir, read its `README.md` if present (else skip).

## 3. Build a structured summary

For each top-level component, produce one memory:

```
<repo or workspace name> · <component path>: <one-sentence purpose>.
Lang: <language>. Top deps: <3-5 deps separated by commas>.
Entry: <main file path if obvious>.
```

Examples:

```
memsy · mcp/: TypeScript MCP server wrapping the Node SDK. Lang: TypeScript.
Top deps: @modelcontextprotocol/sdk, zod, @memsy-io/memsy. Entry: src/server.ts.

memsy · api/: FastAPI control-plane service for orgs/keys/billing. Lang: Python.
Top deps: fastapi, sqlalchemy, stripe, svix. Entry: memsy_api/main.py.
```

Make each memory **standalone** — re-readable without the surrounding session. Drop fluffy adjectives ("robust", "modern", etc.).

## 4. Apply pre-flight filters per memory

| Filter | Action |
|---|---|
| Less than 40 chars after composing | Drop — too sparse to be useful |
| Component is just `tests/`, `examples/`, `docs/` with nothing project-specific | Drop or fold into a single line |
| Description echoes the repo name with no actual info | Drop |

## 5. Present the list, ask for confirmation

```
Memsy indexing plan — N memories to ingest

1. memsy · mcp/: TypeScript MCP server wrapping the Node SDK...
2. memsy · api/: FastAPI control-plane service for orgs...
3. memsy · ui/: Next.js dashboard for org management and console events...
...

Reply: "ingest all", "ingest N,M,…", "drop N", or "cancel".
```

Wait for confirmation. Do not auto-ingest — the user might want to refine.

## 6. Ingest with metadata

For each approved memory, call `memsy_ingest` with one event:
- `kind`: `"app_event"` (not `user_message` — this is a structured codebase fact, not conversation)
- `content`: the standalone summary from step 3
- `ts`: current ISO 8601
- `metadata.source`: `"claude-code-index"`
- `metadata.repo`: the repo name (from `package.json#name`, `pyproject.toml[project].name`, etc.)
- `metadata.component`: the directory path (e.g. `mcp/`, `api/`)
- `metadata.safe_to_delete`: `true` (re-run of `/memsy-index` should be safely re-doable)

## 7. Confirm and suggest re-run cadence

```
✓ Indexed N components into Memsy.
  Repo: <repo name>
  Re-run /memsy-index when:
    - You add a new top-level component
    - Architecture changes meaningfully (deps swap, layout rework)
    - You move between branches with significantly different structures

  Try: /memsy how is <repo> laid out?
```

## Notes

- This command does **not** ingest source code itself. It builds *structural* memories. For "what does this function do" recall, rely on git + the codebase itself; Memsy is for cross-session decisions and high-level context.
- Memories created here have `safe_to_delete: true`, so a cleanup script can remove all `source=claude-code-index` entries to re-index fresh.
- For very large monorepos (50+ components), ingest in two passes: top-level first (let the user confirm), then drill into selected subdirs.
