---
description: Search Memsy memories with a natural-language query
argument-hint: <what you want to recall>
---

The user wants to search Memsy. Their query is everything after the slash command:

`$ARGUMENTS`

Workflow:

1. **If `$ARGUMENTS` is empty or whitespace-only**: ask the user "What would you like to search for?" and stop. Do not call any tool.

2. **Otherwise**, call the `memsy_search` MCP tool with:
   - `query`: `$ARGUMENTS` (verbatim — do not paraphrase)
   - `limit`: 8

3. **Format the response** as a numbered list, ranked by score:
   ```
   Memsy results for "<query>" (N hits)

   1. [score 0.87] <memory text, truncate to 200 chars>
      actor=<actor_id>  observed=<observed_at if present>
   2. [score 0.81] ...
   ```

4. **If 0 results**: print "No memories matched." and suggest:
   - Try broader wording (e.g. drop adjectives, use synonyms).
   - Check the active profile with `/memsy-doctor` — you may be in a different org than where the memory was stored.

5. **If the tool errors out**:
   - `tool not found` / MCP not available → "Memsy isn't available right now. Run `/memsy-doctor` to diagnose, or `/memsy-setup` if this is a fresh install."
   - `401` / auth error → "Memsy rejected the API key. Confirm `MEMSY_API_KEY` is set in the shell that launched Claude Code, then restart."
   - Network / timeout → print the raw error and suggest retry.
   - Other → print the error verbatim and suggest `/memsy-doctor`.

Do not fabricate results. If the tool didn't return data, say so.
