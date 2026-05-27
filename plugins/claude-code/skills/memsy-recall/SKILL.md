---
name: memsy-recall
description: Use this skill when the user asks to recall past context, decisions, or what was discussed previously. Trigger phrases include "what did we decide", "remember when", "have we discussed", "context on X", "do we have anything about Y", "look up", "search past conversations", "find that thing about", or any retrieval-intent question about prior work. Calls memsy_search MCP tool with the topic extracted from the user's question.
---

The user is asking you to recall something from Memsy memory. Run this workflow:

## 1. Extract the topic

From the user's message, strip framing words and keep the substantive nouns:

| User said | Extract |
|---|---|
| "What did we decide about billing storage?" | `billing storage` |
| "Do we have anything on the auth migration?" | `auth migration` |
| "Remember when we picked Postgres over Mongo?" | `Postgres Mongo decision` |
| "Context on the rate limiter rewrite" | `rate limiter rewrite` |

If the message is ambiguous (e.g. "remember that?" with no antecedent), ask a clarifying question before calling the tool. Don't search for an empty / one-word query unless the user actually meant a single topic.

## 2. Call memsy_search

- `query`: the extracted topic
- `limit`: 8

## 3. Present results

Format as bullet points, **grouped by theme** when 3+ results share a thread (e.g. all about the same migration). Each bullet uses the fields `memsy_search` returns (`id`, `score`, `content`, `metadata`):

- Memory `content` (truncate to 200 chars)
- Score in parens

Top 3–5 most relevant first. If memories are clearly unrelated to the query (low scores, off-topic), surface only what's relevant — don't pad. Do **not** invent fields like `observed_at` or `actor_id` — search results don't carry them at the top level; call `memsy_get_memory` for a specific result if the user needs more detail.

## 4. If 0 results

Say clearly: "No memories matched `<query>`." Then offer:
- Broaden the query (drop adjectives, try synonyms).
- Check the active profile with `/memsy-doctor` — the memory might be in a different org.
- Use `/memsy <query>` directly with different wording.

## 5. If the tool errors out

Hand off to the `memsy-setup` skill — do not retry blindly, do not fabricate substitute answers. Be explicit that Memsy isn't reachable right now and point at `/memsy-doctor`.

## Anti-noise rules — DO NOT fire when

- The user is asking about **live state** ("what's the current time", "what's in this file", "what does the env say"). That's not memory; use the appropriate tool.
- The user is asking **hypothetical / forward-looking** questions ("what if we", "should we", "how should this work"). That's planning, not recall.
- The user is asking about something **clearly in the current conversation** — re-read the turn rather than searching memory.
- The phrase appears inside **code, a quote, or a docstring** the user pasted — they're not asking *you* to recall.
