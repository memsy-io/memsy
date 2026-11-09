---
name: memsy-recall
version: 0.1.0
description: Use this skill when the user asks to recall past context, decisions, or what was discussed previously. Trigger phrases include "what did we decide", "remember when", "have we discussed", "context on X", "do we have anything about Y", "look up", "search past conversations", "find that thing about", or any retrieval-intent question about prior work. Calls memsy_search with the topic extracted from the user's question.
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

If the message is ambiguous, ask a clarifying question before calling the tool. Don't search for an empty / one-word query unless the user actually meant a single topic.

## 2. Call memsy_search

- `query`: the extracted topic
- `limit`: 8

## 3. Present results

Format as bullet points, **grouped by theme** when 3+ results share a thread. Each bullet uses the fields `memsy_search` returns (`id`, `score`, `content`, `metadata`):

- Memory `content` (truncate to 200 chars)
- Score in parens

Top 3–5 most relevant first. If memories are clearly unrelated to the query, surface only what's relevant. Do **not** invent fields — call `memsy_list_memories` with a specific id if the user needs detail on a result.

## 4. If 0 results

Say: "No memories matched `<query>`." Then offer:
- Broaden the query (drop adjectives, try synonyms).
- Check the active org with `memsy_list_orgs` — the memory might be in a different profile.
- Try `memsy_list_memories` to see what's stored (it lists the **current actor's** memories by default; pass `all_actors: true` for an org-wide view in case the memory was stored under a different actor).

## 5. If the tool errors out

Call `memsy_health` to diagnose. Do not retry blindly or fabricate substitute answers. Be explicit that Memsy isn't reachable — suggest the user verify `MEMSY_API_KEY` is set in the environment.

## Anti-noise rules — DO NOT fire when

- The user is asking about **live state** ("what's the current time", "what's in this file"). That's not memory.
- The user is asking **hypothetical / forward-looking** questions ("what if we", "how should this work"). That's planning, not recall.
- The user is asking about something **clearly in the current conversation** — re-read the turn.
- The phrase appears inside **code, a quote, or a docstring** the user pasted — they're not asking you to recall.
