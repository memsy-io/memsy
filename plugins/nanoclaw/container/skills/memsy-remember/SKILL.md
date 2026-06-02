---
name: memsy-remember
description: Use when the user explicitly asks to save, note, or persist a fact, decision, or piece of context for future sessions. Trigger phrases include "remember that", "save this decision", "note that", "let's remember", "store this", "tag this as", "for future reference", or any clear save-intent statement. Calls memsy_ingest MCP tool to persist the substance.
---

The user wants to commit something to Memsy memory. Run this workflow:

## 1. Extract the substance

Strip the leading verb / framing and keep the substance **verbatim**:

| User said | Store |
|---|---|
| "Remember that we picked Postgres for billing because it's already deployed" | `we picked Postgres for billing because it's already deployed` |
| "Let's note that the rate limiter rewrite is scoped to v0.4, not v0.3" | `the rate limiter rewrite is scoped to v0.4, not v0.3` |
| "Tag this as a decision: we're not adding GraphQL" | `a decision: we're not adding GraphQL` |

**Do not paraphrase, rewrite, or invent context.**

## 2. Pre-flight checks — refuse / clarify if

- **Too short** (< 20 chars): ask the user to expand.
- **Contains a secret-shaped token** (`msy_`, `sk_`, `ghp_`, `Bearer`): refuse. Say: "That looks like it contains a secret — Memsy stores in plain text. Paraphrase without it."
- **Transient / scratch content**: ask if they really want to persist it.

## 3. Confirm-before-store (if enabled)

If your context contains `[memsy modes: ... confirm-before-store ...]`, ask before calling the tool:

```
Memsy will store:
  <stripped substance>

Save? (y / n / edit "<new text>")
```

- `y` → proceed. `n` → say "Not stored." and stop. `edit "..."` → use the new text.

## 4. Call memsy_ingest

A single event:
- `kind`: `"user_message"`
- `content`: the substantive text from step 1 (verbatim)
- `ts`: current ISO 8601 timestamp

## 5. Confirm back

```
✓ Stored in Memsy.
  Content: <first 80 chars>...
  Event:   <event_id, first 8 chars>
```

## 6. If the tool errors out

Call `memsy_health` to diagnose. **Be explicit** that the memory was **NOT saved**.

## Anti-noise rules — DO NOT fire when

- The user is asking a question ("did we decide...?" → that's recall, not store).
- The user is describing current state without save intent.
- The "save" verb refers to a file save ("save this to foo.ts") — that's Write, not Memsy.
