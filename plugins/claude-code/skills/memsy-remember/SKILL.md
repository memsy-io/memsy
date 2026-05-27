---
name: memsy-remember
description: Use this skill when the user explicitly asks to save, note, or persist a fact, decision, or piece of context for future sessions. Trigger phrases include "remember that", "save this decision", "note that", "let's remember", "store this", "tag this as", "for future reference", or any clear save-intent statement. Calls memsy_ingest MCP tool to persist the substance.
---

The user wants to commit something to Memsy memory. Run this workflow:

## 1. Extract the substance

Strip the leading verb / framing (`remember that`, `save this`, `note that`, `let's remember`, `tag this as`, `for future reference`) and keep the substance **verbatim**. This rule must match the smart-router skill and the `/memsy:memsy-remember` command exactly — three converging paths must store the same content for the same input.

| User said | Store |
|---|---|
| "Remember that we picked Postgres for billing because it's already deployed" | `we picked Postgres for billing because it's already deployed` |
| "Let's note that the rate limiter rewrite is scoped to v0.4, not v0.3" | `the rate limiter rewrite is scoped to v0.4, not v0.3` |
| "Tag this as a decision: we're not adding GraphQL" | `a decision: we're not adding GraphQL` |

**Do not paraphrase, rewrite, or invent context.** If the result wouldn't be intelligible standalone (e.g. resolves to a pronoun with no antecedent), ask the user to expand rather than guessing. Drop only the framing verb; preserve every substantive word.

## 2. Pre-flight checks — refuse / clarify if

- **Too short** (< 20 chars): ask the user to expand. A bare "yes" or "Postgres" isn't a memory.
- **Contains a secret-shaped token** (`msy_`, `sk_`, `ghp_`, `Bearer `, anything resembling an API key, password, or JWT): **refuse**. Say: "That looks like it contains a secret — Memsy stores in plain text. Either paraphrase without the secret, or use a real secret manager."
- **Transient / scratch content** (TODOs for the current turn, half-formed ideas being explored, debug output): ask if they really want to persist it. Default to NOT storing unless they reconfirm.
- **Already-stored**: if you just stored something nearly identical this session, skip and tell the user it's a duplicate.

## 3. Call memsy_ingest

A single event:
- `kind`: `"user_message"`
- `content`: the substantive text from step 1 (verbatim, no padding)
- `ts`: current ISO 8601 timestamp

Do NOT add `role_id` / `team_id` unless the user explicitly specified them — let the user's defaults from `memsy_set_defaults` apply.

## 4. Confirm back

```
✓ Stored in Memsy.
  Content: <first 80 chars>...
  Event:   <event_id, first 8 chars>
  Use /memsy <query> to find it later.
```

## 5. If the tool errors out

Hand off to the `memsy-setup` skill. **Be explicit** that the memory was **NOT saved**. Do not silently swallow the failure or pretend it worked.

## Anti-noise rules — DO NOT fire when

- The user is asking a **question** ("did we decide...?" → that's recall, not store).
- The user is describing **current state** without save intent ("the rate limiter is at v0.3" without "remember that").
- The user is **iterating on a draft** — wait for explicit confirmation before storing.
- The "save" verb refers to a **file save** ("save this to foo.ts") — use Write, not Memsy.
