---
description: Check Memsy MCP health, identity, active profile, and surface setup hints
---

Run a Memsy connectivity and identity check. This is the **first command** to try when anything Memsy-related isn't working.

## Workflow

1. **Check the MCP is loaded at all** — confirm a `memsy_*` tool (e.g. `memsy_health`) is in your available toolkit before calling. If no Memsy tools exist:
   ```
   Memsy Doctor
   ────────────
   Status:  ❌ MCP server not loaded.

   Likely cause: the Memsy plugin isn't installed, isn't enabled, or its
   .mcp.json points at a binary that didn't start.

   Fix:
     1. claude plugin list          # confirm "memsy" is enabled
     2. claude plugin enable memsy  # if listed but disabled
     3. Restart Claude Code
     4. For local dev: cd <repo>/mcp && npm install && npm run build
        then cd <repo>/plugins/claude-code && ./install.sh --dev <repo>
   ```
   Then **stop** — do not invent tool calls.

2. **If Memsy tools exist**, run these in parallel:
   - Call `memsy_health` (no args)
   - Read `memsy://actor/current`
   - Read `memsy://profile/current`

3. **On success**, print:
   ```
   Memsy Doctor
   ────────────
   Status:    ok  (v<version>)
   Base URL:  <base_url>
   Profile:   <profile_name>  <org_label if present>
   Actor:     <actor_id>  (<source>)
   Session:   <session_id>
   ```

   If the actor resource includes a `setup_hint` (source is `derived-git` or `derived-os` AND `actor_id_pinned` is false), append:
   ```
   Hint: <setup_hint>
   Run /memsy-setup to pin an actor_id and defaults.
   ```

4. **On `memsy_health` error**, map the error → next-step pointer:

   | Error shape | Print |
   |---|---|
   | 401 / 403 / "invalid API key" / "API key required" | `Status: ❌  Auth failed.`<br>`MEMSY_API_KEY may be missing, wrong, or revoked. Confirm it's set in the shell that launched Claude Code, then restart.` |
   | `ECONNREFUSED` / `ENOTFOUND` / network | `Status: ❌  Cannot reach <base_url>.`<br>`Check your network or override MEMSY_BASE_URL if you're on a private deploy.` |
   | 5xx / "internal server error" | `Status: ❌  Memsy API returned 5xx.`<br>`Likely a transient backend issue. Retry in a minute; if it persists, check status.memsy.io.` |
   | anything else | print the raw error verbatim, then `Run /memsy-setup or visit https://docs.memsy.io/docs/mcp for help.` |

   In all error branches, still print whichever of the actor / profile resources succeeded — partial info is still useful.

5. **Do not fabricate** any field. If a resource is missing a key, omit that line rather than guessing.
