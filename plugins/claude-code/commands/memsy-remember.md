---
description: Store a fact, decision, or note in Memsy so it surfaces in future sessions
argument-hint: <what to remember>
---

The user wants to commit something to Memsy memory. Content:

`$ARGUMENTS`

Workflow:

1. **If `$ARGUMENTS` is empty or whitespace-only**: ask "What would you like me to remember?" and stop. Do not call any tool.

2. **If `$ARGUMENTS` is shorter than 20 characters**: this is likely incomplete. Ask the user to confirm or expand before storing. Do not auto-pad with framing words.

3. **If `$ARGUMENTS` contains a secret-shaped token** (e.g. `msy_`, `sk_`, `ghp_`, `Bearer `, anything that looks like an API key, password, or JWT): **refuse**. Say: "That looks like it contains a secret — Memsy stores in plain text and rotates poorly. Either paraphrase without the secret, or store the secret in a real secret manager."

4. **Otherwise**, strip any leading framing verb (`remember that`, `save this`, `note that`, `tag this as`, `let's remember`, `for future reference`) from `$ARGUMENTS` — same transform the smart-router skill and the `memsy-remember` skill apply, so all three paths store identical content for the same input.

5. **Confirm-before-store mode**: if your session context contains the line `[memsy modes: ... confirm-before-store ...]` (emitted by the SessionStart hook when `MEMSY_CONFIRM_STORE=on`), surface the stripped content and ask the user to confirm before calling the tool:
   ```
   Memsy will store:
     <stripped substance>

   Save? (y / n / edit "<new text>")
   ```
   - On `y` or "save it" → proceed to step 6.
   - On `n` or "don't" → say "Not stored." and stop. Do **not** call `memsy_ingest`.
   - On `edit "..."` → use the new text as the content and proceed.

   If the mode line isn't in context, skip this step entirely.

6. **Call `memsy_ingest`** with a single event:
   - `kind`: `"user_message"`
   - `content`: the stripped substance (verbatim — do not paraphrase or rewrite)
   - `ts`: current ISO 8601 timestamp

7. **Confirm back** to the user:
   ```
   ✓ Stored in Memsy.
     Event:  <event_id, first 8 chars>
     Actor:  <actor_id from response or memsy://actor/current>
     Use /memsy <query> to search for it later.
   ```

8. **If the tool errors out**: same fallback table as `/memsy` — direct the user to `/memsy:memsy-doctor` or `/memsy:memsy-setup` (or `/memsy doctor` / `/memsy setup` via the smart-router). Be explicit that the memory **was not saved**; do not silently swallow the failure.
