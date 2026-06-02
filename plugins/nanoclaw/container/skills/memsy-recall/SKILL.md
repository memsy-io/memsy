---
name: memsy-recall
description: Use when the user asks to recall past context, decisions, or what was discussed previously. Trigger phrases include "what did we decide", "remember when", "have we discussed", "context on X", "do we have anything about Y", "look up", "search past conversations", or any retrieval-intent question about prior work. Calls memsy_search MCP tool with the topic extracted from the user's question.
---

The user wants to recall something from Memsy memory. Run this workflow:

## 1. Extract the topic

From the user's message, strip framing words and keep the substantive nouns:

| User said | Extract |
|---|---|
| "What did we decide about billing storage?" | `billing storage` |
| "Do we have anything on the auth migration?" | `auth migration` |
| "Remember when we picked Postgres over Mongo?" | `Postgres Mongo decision` |
| "Context on the rate limiter rewrite" | `rate limiter rewrite` |

If the message is ambiguous, ask a clarifying question before calling the tool.

## 2. Call memsy_search

- `query`: the extracted topic
- `limit`: 8

## 3. Present results

Format as bullet points, grouped by theme when 3+ results share a thread:

- Memory content (truncate to 200 chars)
- Score in parens

Top 3–5 most relevant first. Call `memsy_get_memory` if the user needs detail on a specific result.

## 4. If 0 results

Say: "No memories matched `<query>`." Then offer:
- Broaden the query (drop adjectives, try synonyms)
- Check active org with `memsy_list_orgs` — the memory may be in a different profile

## 5. If the tool errors out

Call `memsy_health` to diagnose. Do not retry blindly or fabricate answers.

## Anti-noise rules — DO NOT fire when

- The user is asking about live state ("what's in this file"). That's not memory.
- The user is asking hypothetical / forward-looking questions. That's planning.
- Something is clearly in the current conversation — re-read the turn.
