---
name: memsy-turn-sync
description: Active only when [memsy modes: turn-sync] appears in context. After every assistant response, emit a memsy_ingest_turn system action so the host's Memsy module persists the turn to the memory extraction pipeline. Fires automatically — no user trigger needed.
---

This skill is active when your context contains `[memsy modes: ... turn-sync ...]`.

## What to do after each response

After answering the user's message, emit a system action so the host ingests the turn:

Call `send_message` (or the equivalent NanoClaw system-message tool) with:
```json
{
  "kind": "system",
  "action": "memsy_ingest_turn",
  "payload": {
    "user_content": "<the user's message text, verbatim, max 32000 chars>",
    "assistant_content": "<your response text, max 32000 chars>"
  }
}
```

The host's Memsy module catches this action and forwards it to `POST /ingest`. Memsy's async extraction pipeline then decides what's memory-worthy — no judgment needed here.

## Skip conditions

Do NOT emit the action if:
- Your response was shorter than 40 chars (e.g. "OK" or "Done")
- Your response was purely a tool call result with no explanatory text
- You already emitted `memsy_ingest_turn` for this exact turn

## Hard rule

The system action is secondary — it comes AFTER your primary response. Never delay or modify your answer because of this. If the system action fails or you can't emit it, ignore it and continue normally.
