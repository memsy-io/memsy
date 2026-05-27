---
name: memsy
description: Triggered ONLY when the user explicitly types the `/memsy` slash command in Claude Code. Do not auto-fire on natural-language phrasing — the `memsy-recall`, `memsy-remember`, and `memsy-setup` skills handle those without a slash.
---

The user invoked `/memsy <something>`. Treat everything they typed after `/memsy` as the **query** for this skill. If they typed `/memsy` alone with no arguments, the query is empty.

This skill is the universal Memsy entry point — read the user's message after `/memsy`, classify intent (search / store / switch profile / list / doctor / setup), and run the matching Memsy workflow inline.

## Step 1: Classify intent from the user's query

Apply these rules **in order, first match wins**. Be **conservative** — when ambiguous between SEARCH and STORE, default to SEARCH (mis-storing creates noise that's hard to undo; mis-searching is harmless).

| Query shape | Intent | What to do |
|---|---|---|
| empty / whitespace only | `MENU` | Show the short help menu below. |
| starts with `remember`, `save`, `note that`, `store`, `tag this as`, `let's remember`, `for future reference` | `STORE` | Drop the leading verb; store the rest. |
| starts with `switch to`, `use profile`, `change profile`, or `org` followed by a profile name | `SWITCH` | Switch active Memsy profile. |
| starts with `list`, `show`, `browse` and mentions memories/recent | `LIST` | List recent memories. |
| is exactly `doctor`, `health`, `status`, `check`, or `diagnose` (one or two words) | `DOCTOR` | Run the `/memsy-doctor` workflow inline. |
| is exactly `setup`, `configure`, `init`, `set defaults`, or `onboard` (one or two words) | `SETUP` | Run the `/memsy-setup` workflow inline. |
| starts with `mode`, `modes`, `proactive`, `confirm`, `permission`, `autocontext`, or `auto-context` (with or without `on`/`off`/`status`) | `MODE` | Toggle a session-scoped behavior flag. |
| anything else — a question, topic, or noun phrase | `SEARCH` | Search memories with the query verbatim. |

**Edge cases**:

- `/memsy remember` (verb only, no content) → ask "What would you like me to remember?"
- `/memsy switch to` (no profile name) → fall through to LIST profiles, ask which to switch to.
- Mixed intent ("remember to search for X later") → STORE wins, the verb is `remember`.
- If you genuinely can't tell, **ask** the user — don't guess.

## Step 2: Execute the matched workflow

### `MENU` (empty query)

Call `memsy_health` once silently — only surface output if it errors. Then print:

```
Memsy is ready. What do you want to do?

  /memsy <question>           — search past memories
  /memsy remember <fact>      — store something for later
  /memsy switch <profile>     — change active org
  /memsy doctor               — health + identity check
  /memsy setup                — first-time defaults walkthrough
  /memsy list                 — show recent memories
  /memsy proactive on|off     — auto-save preferences/decisions (session)
  /memsy confirm on|off       — ask before each save (session)
  /memsy modes                — show current mode state

Or just talk naturally — say "what did we decide about X" or "remember
that Y" and the recall / remember skills fire automatically (no slash).
```

If `memsy_health` errored, hand off to the `memsy-setup` skill instead.

### `STORE`

1. Strip the leading verb (e.g. `remember that we picked Postgres` → `we picked Postgres`).
2. Pre-flight guards:
   - too short (<20 chars) → ask user to expand.
   - contains a secret-shaped token (`msy_`, `sk_`, `ghp_`, `Bearer `, etc.) → **refuse**. Say: "That looks like it contains a secret — Memsy stores in plain text. Paraphrase without it, or use a real secret manager."
3. **Confirm-before-store mode**: if your session context contains `[memsy modes: ... confirm-before-store ...]`, surface the stripped content and ask `Save? (y / n / edit "<new text>")`. Proceed only on `y` or `edit`. On `n`, say "Not stored." and stop. If the mode line isn't in context, skip this step (user invoked `/memsy` explicitly — that's deliberate enough on its own).
4. Call `memsy_ingest` with one event: `kind="user_message"`, `content=<stripped substance>`, `ts=<current ISO 8601>`.
5. Confirm: `✓ Stored: <first 80 chars>...` plus event_id (first 8 chars).

### `SWITCH`

1. Extract the profile name (e.g. `switch to work` → `work`).
2. Call `memsy_use_org` with `profile=<name>`.
3. On success: print new `profile_name`, `org_label`, `base_url`, `actor_id`.
4. On unknown-profile error: call `memsy_list_orgs`, list available profiles, point at `~/.memsy/config.json` for adding new ones.

### `LIST`

1. Call `memsy_list_memories` with `limit=20`.
2. Show as a numbered list: text (truncated to 100 chars), kind, observed_at.
3. Suggest: "Use `/memsy <query>` to search a specific topic."

### `SEARCH`

1. Call `memsy_search` with `query=<user's query verbatim>` and `limit=8`. **Do not paraphrase.**
2. Format as a numbered list ranked by score. Use only the fields `memsy_search` actually returns (`id`, `score`, `content`, `metadata`, `source_events`, `source_metadata`):
   ```
   Memsy results for "<query>" (N hits)

   1. [score 0.87] <content, truncate to 200 chars>
   2. [score 0.81] <content, truncate to 200 chars>
   ```
   Do not invent fields. If the user needs timestamps or actor attribution, call `memsy_get_memory` for the specific result they want to dig into.
3. If 0 results: say so plainly. Suggest broader wording or `/memsy:memsy-doctor` to check the active profile (memory may be in a different org).

### `DOCTOR`

Run the full `/memsy-doctor` workflow inline (don't recursively call the slash command — just do the work):

1. Check Memsy tools are loaded; if no `memsy_*` tool exists, print the "MCP not loaded" diagnostic and stop.
2. Call `memsy_health` + read `memsy://actor/current` + `memsy://profile/current` in parallel.
3. On success print the green block (Status / Base URL / Profile / Actor / Session).
4. On error map to specific next-step pointer:
   - 401/403 → "API key may be missing/wrong — confirm `MEMSY_API_KEY` in launch shell, restart"
   - `ECONNREFUSED` / `ENOTFOUND` → "Cannot reach `<base_url>` — check network or `MEMSY_BASE_URL`"
   - 5xx → "Transient backend issue — retry; check status.memsy.io"
   - anything else → print raw error + suggest `/memsy-setup`

### `MODE`

Lets the user toggle Memsy behavior flags from chat without setting env vars + restarting. Three flags are toggleable in-session:

| Query phrasing | Flag | On effect | Off effect |
|---|---|---|---|
| `proactive on` / `proactive off` / `proactive` (toggle) | `MEMSY_PROACTIVE` | Actively watch for save-worthy content (preferences/intents/decisions) and store via `memsy_ingest`. | Stop proactive saves; only explicit verbs / slash commands save. |
| `confirm on` / `confirm off` / `permission on` / `permission off` | `MEMSY_CONFIRM_STORE` | Ask `Save? (y/n/edit)` before every single-item store. | Store directly without asking. |
| `autocontext on` / `autocontext off` / `auto-context on/off` | `MEMSY_SESSION_AUTOCONTEXT` | Inject "recent memories" recall block at session start. **Takes effect at next launch** — already-running session is unaffected. | Don't inject auto-context at next launch. |
| `mode` / `modes` / `status` (no on/off) | — | Show current state of all three modes. | — |

#### Implementation rules

1. **Read current state** from your session context. Modes set at launch appear in the `[memsy modes: ...]` line emitted by the SessionStart hook. Subsequent `/memsy <mode> on/off` invocations override the launch state for the rest of the session.

2. **Apply the change** by:
   - Acknowledging the new state explicitly back to the user.
   - Updating your behavior **for the rest of this session** to match. For `MEMSY_PROACTIVE`, this means starting to watch (or stop watching) save-worthy content. For `MEMSY_CONFIRM_STORE`, this means starting (or stopping) the pre-save confirmation step on memsy-remember / smart-router STORE / `/memsy:memsy-remember`.

3. **Reply with this exact shape**:

   ```
   ✓ Memsy mode: <flag> = <new state>   (session-scoped)

     To persist across restarts:
       export MEMSY_<FLAG>=<value>     # add to ~/.zshrc or ~/.bashrc
       then restart Claude Code
   ```

4. **Special case — autocontext**: changing it mid-session has no effect until next launch (the SessionStart hook has already fired). Make this explicit:

   ```
   ✓ Memsy mode: autocontext = on   (effective NEXT session — SessionStart already fired this turn)

     To make it take effect now: restart Claude Code with
       export MEMSY_SESSION_AUTOCONTEXT=on   # then `claude` from that shell
   ```

5. **`mode` / `modes` / `status` with no direction** → print the current state of all three:

   ```
   Memsy modes — current session
     proactive:               on   (toggled via /memsy)
     confirm-before-store:    off
     autocontext:             on   (fires at next session start)
   ```

   For each mode, indicate the source: `(env)` if from launch env, `(toggled via /memsy)` if changed in-session, `(default off)` if never set.

### `SETUP`

Run the full first-time-defaults walkthrough inline:

1. `memsy_list_roles` → show numbered list; if empty, ask user for role names + create via `memsy_create_role`.
2. Ask which role(s) to default to.
3. Same with `memsy_list_teams` / `memsy_create_team`.
4. Read `memsy://actor/current`, explain current value + source, offer agent-style / personal-handle / keep-current.
5. `memsy_set_defaults` with the chosen roles, teams, actor_id, and `persist="global"`.
6. Confirm back and suggest `/memsy doctor` to verify.

## Step 3: Universal failure fallback

Any tool call returning "tool not found", 401 / 403, `ECONNREFUSED`, or other MCP-side failures → hand off to the `memsy-setup` skill. **Never** fabricate substitute answers. **Always** be explicit when a store didn't actually land.

## Hard rules

- **One round-trip**: execute the matched workflow inline. Do not recursively invoke `/memsy-doctor` or other sibling slash commands — Claude Code can't nest slash invocations.
- **No silent rerouting**: if intent is ambiguous, ask the user rather than guessing.
- **Verbatim queries**: for SEARCH, pass the user's query to `memsy_search` exactly as typed — no paraphrasing, summarizing, or "improvement".
- **DO NOT auto-fire**: this skill should only run when the user explicitly typed `/memsy`. Natural-language Memsy phrasing ("what did we decide", "remember that") is handled by `memsy-recall` and `memsy-remember` skills.
