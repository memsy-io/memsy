---
description: Capture the substance of this conversation as Memsy memories — decisions, fixes, learnings worth surfacing in future sessions
---

The user wants to save what's worth saving from the current conversation. Run this workflow at the end of a working session (or any time you've crossed a meaningful milestone).

> **Why this isn't a hook**: Claude Code's `Stop` and `SessionEnd` hooks don't pipe their stdout back into Claude, so an automatic save-on-stop hook couldn't actually call MCP tools. A user-initiated slash command is both safer (no surprise noise) and more functional (you can actually do the work).

## 1. Scan the conversation for save-worthy content

Review the recent turns for items that match **at least one** of these signal patterns:

- **Decisions**: "we decided", "we'll go with", "switching from X to Y", "agreed to", "settling on"
- **Fixes**: "the bug was", "root cause", "fixed by", "the issue was"
- **Learnings**: "turns out", "the trick is", "found that", "X actually means Y"
- **Constraints we discovered**: "X doesn't work because", "this fails when", "we can't do X"
- **Explicit save requests**: anything the user actually asked you to remember during the session

Skip:
- Transient debugging chatter ("let me try X", "hmm interesting")
- Code you wrote that's already in git (the diff is the record)
- Repeated discussion of the same point (de-dupe)
- Half-formed ideas that were rejected or paused

## 2. Apply pre-flight filters

For each candidate, before storing:

| Filter | Action |
|---|---|
| Shorter than 40 chars when standalone | Drop — not enough substance |
| Contains a secret-shaped token (`msy_`, `sk_`, `ghp_`, `Bearer `, anything that looks like an API key, password, or JWT) | **Refuse**. Say: "That looks like it contains a secret — Memsy stores in plain text. Either paraphrase without the secret, or use a real secret manager." Same wording as `/memsy:memsy-remember` and the `memsy-remember` skill — all four save surfaces share this rule. |
| Requires conversation context to make sense (uses unresolved pronouns like "the thing we were discussing") | Rewrite as standalone, or drop |
| Already in Memsy from earlier in this session (you already stored a near-duplicate) | Drop — don't double-store |

## 3. Present the list to the user **before** storing

Print the de-duped, filtered candidates as a numbered list:

```
Memsy checkpoint — review before saving
────────────────────────────────────────
1. Picked Postgres for billing because it's already deployed in prod
   tags: decision, billing
2. Rate limiter rewrite is scoped to v0.4, not v0.3
   tags: decision, scope
3. The 401 error on stale tokens was because revoke_at was being compared
   in seconds, not milliseconds
   tags: fix, auth

Reply with: "save all", "save N,M,…", "drop N", or "cancel".
```

**Do not auto-store**. Wait for the user's confirmation. This prevents noise creep: the user sees what's being persisted and curates.

## 4. After confirmation, store — in ONE batched call

Call `memsy_ingest` **once** with `events` as an array (the MCP tool accepts up to 100 events per batch — don't loop). Each element:

- `kind`: match the speaker the item came from — `"user_message"` for something the user stated, `"assistant_message"` for a conclusion you (the assistant) reached. Set it per event (a batch can mix both). Don't blindly use `user_message`.
- `content`: the standalone sentence (from step 1, refined in step 3)
- `ts`: the conversation timestamp closest to where the content originated (if you can identify it), else `now`
- `metadata`: a **JSON-encoded string** (the tool's schema requires `metadata: string`, max 4096 chars). Set it to `JSON.stringify({source: "claude-code-checkpoint", safe_to_delete: true})` — i.e. the literal string `{"source":"claude-code-checkpoint","safe_to_delete":true}`.

If the approved list exceeds 100 items, split into batches of 100; otherwise one call.

## 5. Confirm back

```
✓ Saved N memories from this session in 1 batch.
  Event IDs: a1b2c3d4, e5f6g7h8, ...
  Use /memsy <topic> to find any of them later.
```

## Edge cases

- **Nothing qualifies**: say "Nothing in this session looks worth saving — that's fine, most don't." Don't pad with anything marginal.
- **MCP errors during save**: tell the user the save failed, surface the error verbatim, and hand off to the `memsy-setup` skill if it looks like an auth / network / tool-not-loaded issue. **Be explicit** that the memories were NOT stored — do not silently swallow.
- **User invokes the command mid-session, not at end**: same workflow — works at any point.
