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

## 6. Ingest with metadata — in ONE batched call

Call `memsy_ingest` **once** with `events` as an array (the MCP tool accepts up to 100 events per batch). For each approved memory, append an element:

- `kind`: `"app_event"` (not `user_message` — this is a structured codebase fact, not conversation)
- `content`: the standalone summary from step 3
- `ts`: current ISO 8601
- `metadata`: a **JSON-encoded string** (the tool's schema requires `metadata: string`, max 4096 chars). Build it as `JSON.stringify({source: "claude-code-index", repo: "<repo_name>", component: "<dir_path>", safe_to_delete: true})`.

For monorepos with >100 components, split into batches of 100 (one `memsy_ingest` per batch).

## 7. Confirm and suggest re-run cadence

```
✓ Indexed N components into Memsy (1 batch).
  Repo: <repo name>
  Re-run /memsy-index when:
    - You add a new top-level component
    - Architecture changes meaningfully (deps swap, layout rework)
    - You move between branches with significantly different structures

  Try: /memsy how is <repo> laid out?
```

## Error handling

If `memsy_ingest` returns "tool not found", 401 / 403, `ECONNREFUSED`, or any other MCP-side failure:

- **Stop**. Do not retry. Do not fabricate success.
- Tell the user the index was **NOT saved**.
- Hand off to the `memsy-setup` skill — it diagnoses by symptom and walks through the matching fix.

For partial failures (e.g. one batch succeeded, the next failed): tell the user exactly which batches landed (with event_ids) and which didn't.

## Notes

- This command does **not** ingest source code itself. It builds *structural* memories. For "what does this function do" recall, rely on git + the codebase itself; Memsy is for cross-session decisions and high-level context.
- Memories created here have `safe_to_delete: true` in their JSON metadata, so a cleanup script can remove all entries where `metadata` contains `"source":"claude-code-index"` to re-index fresh.
