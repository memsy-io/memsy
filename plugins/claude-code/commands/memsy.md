---
description: Memsy — search, store, switch profiles, or diagnose. Smart-routes from natural language.
argument-hint: <anything — "what did we decide about X" | "remember Y" | "switch to work" | "doctor">
---

The user invoked `/memsy $ARGUMENTS`. This command is a **universal entry point**. Interpret their intent and run the matching workflow — they shouldn't need to memorize subcommands.

## Step 1: Detect intent from `$ARGUMENTS`

Apply these rules **in order, first match wins**. Be **conservative**: when in doubt between SEARCH and STORE, default to SEARCH (storing wrong content is harder to undo than searching the wrong thing).

| `$ARGUMENTS` shape | Intent | Action |
|---|---|---|
| empty / whitespace only | `MENU` | Show the short help menu (see below). |
| starts with `remember`, `save`, `note that`, `store`, `tag this as`, `let's remember`, `for future reference` | `STORE` | Drop the leading verb, store the rest. |
| starts with `switch to`, `use profile`, `org`, `change profile` followed by a name | `SWITCH` | Switch to that profile. |
| starts with `list`, `show`, `browse` and mentions memories/recent | `LIST` | List recent memories. |
| is exactly `doctor`, `health`, `status`, `check`, or `diagnose` (one or two words) | `DOCTOR` | Run the `/memsy-doctor` workflow inline. |
| is exactly `setup`, `configure`, `init`, `set defaults`, or `onboard` (one or two words) | `SETUP` | Run the `/memsy-setup` workflow inline. |
| anything else — a question, topic, or noun phrase | `SEARCH` | Search memories with `$ARGUMENTS` as the query. |

**Edge cases**:
- `/memsy remember` (verb only, no content) → ask "What would you like me to remember?"
- `/memsy switch to` (no profile name) → fall through to LIST profiles, ask which to switch to
- Mixed intent (e.g. "remember to search for X later") → STORE wins (the verb is "remember")
- If you can't tell, **ask** the user which they meant — don't guess.

## Step 2: Execute the matched workflow

### `MENU` (empty args)

Call `memsy_health` once (silently — only show output if it errors). Then print:

```
Memsy is ready. What do you want to do?

  /memsy <question>          — search past memories
  /memsy remember <fact>     — store something for later
  /memsy switch <profile>    — change active org
  /memsy doctor              — health + identity check
  /memsy setup               — first-time defaults walkthrough
  /memsy list                — show recent memories

Or just talk naturally — say "what did we decide about X" or "remember that Y"
and the recall / remember skills will fire automatically.
```

If `memsy_health` errored, hand off to the `memsy-setup` skill instead.

### `STORE`

1. Strip the leading verb (e.g. `remember that we picked Postgres` → `we picked Postgres`).
2. Apply the same pre-flight guards as the `memsy-remember` skill / `/memsy-remember` command:
   - too short (<20 chars) → ask user to expand
   - contains secret-shaped token (`msy_`, `sk_`, `ghp_`, `Bearer`, etc.) → refuse, explain why
3. Call `memsy_ingest` with one event: `kind="user_message"`, `content=<stripped substance>`, `ts=<now ISO 8601>`.
4. Confirm: `✓ Stored: <first 80 chars>...` plus event_id (first 8 chars).

### `SWITCH`

1. Extract the profile name (e.g. `switch to work` → `work`).
2. Call `memsy_use_org` with `profile=<name>`.
3. On success: show new profile_name, org_label, base_url, actor_id.
4. On unknown-profile error: call `memsy_list_orgs` and show available profiles + the path to add one (`~/.memsy/config.json`).

### `LIST`

1. Call `memsy_list_memories` with `limit=20`.
2. Show as a numbered list — text (truncated to 100 chars), kind, observed_at.
3. Suggest: "Use `/memsy <query>` to search a specific topic."

### `SEARCH`

1. Call `memsy_search` with `query=$ARGUMENTS` (verbatim) and `limit=8`.
2. Format as a numbered list ranked by score: `[score] memory text · actor=X observed=Y`.
3. If 0 results: say so plainly and suggest broader wording or `/memsy-doctor` to check the active profile.

### `DOCTOR`

Run the full `/memsy-doctor` workflow inline (don't recursively invoke another command — just do the calls):
- Check MCP is loaded; if not, print the "MCP not loaded" diagnostic and stop.
- Call `memsy_health`, read `memsy://actor/current` + `memsy://profile/current` in parallel.
- Print the green block on success, or map the error to a specific next-step pointer (401 → auth fix, ECONNREFUSED → network, 5xx → transient).

### `SETUP`

Run the full `/memsy-setup` workflow inline — `memsy_list_roles`/`_teams`, ask which to default to, ask about actor_id, `memsy_set_defaults` with `persist="global"`.

## Step 3: Universal failure fallback

Any tool call returning "tool not found", 401/403, ECONNREFUSED, or other MCP-side failures → hand off to the `memsy-setup` skill. **Never** fabricate substitute answers. **Always** be explicit when a store didn't land.

## Hard rules

- **One round-trip**: don't recursively call a sibling slash command — execute the matched workflow inline.
- **No silent rerouting**: if you switched intents (e.g. user said `/memsy remember` and you treated it as LIST because of ambiguity), tell the user "I'm not sure what you meant — did you want to store or search?".
- **Verbatim queries**: when searching, pass `$ARGUMENTS` to `memsy_search` exactly as the user typed it. Don't paraphrase, summarize, or "improve" it.
