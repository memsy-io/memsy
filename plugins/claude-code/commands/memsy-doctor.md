---
description: Check Memsy MCP health, identity, and active profile
---

Run a Memsy connectivity and identity check. Do these three calls in parallel:

1. Call the `memsy_health` MCP tool with no arguments.
2. Read the `memsy://actor/current` MCP resource.
3. Read the `memsy://profile/current` MCP resource.

Then print a single tidy summary in this exact shape:

```
Memsy Doctor
────────────
Status:    <status from memsy_health, e.g. "ok"> (v<version>)
Base URL:  <base_url from profile resource>
Profile:   <profile_name>  <org_label if present>
Actor:     <actor_id>  (<source>)
Session:   <session_id from actor resource>
```

If the actor resource's `source` is `derived-git` or `derived-os` AND no `actor_id_pinned` is true, append:

```
Hint: <setup_hint from the actor resource>
```

If `memsy_health` returns an error, print `Status: ❌` and the error message instead of the success block, then suggest:

- Make sure `MEMSY_API_KEY` is set in your shell and Claude Code was restarted after install.
- Run `/memsy-setup` (coming in v0.2.0) to configure defaults, or set `MEMSY_ACTOR_ID` in the shell to pin a stable actor id.
- See https://docs.memsy.io/docs/mcp for the full setup guide.

Do not invent fields. If a resource is missing a key, omit that line rather than guessing.
