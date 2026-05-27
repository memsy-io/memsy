---
description: First-time setup — pick default role(s), team(s), and pin your actor identity
---

The user wants to configure their Memsy defaults so subsequent searches and stores don't need explicit arguments every time.

This is the same walkthrough as the `/memsy:setup-defaults` MCP prompt — surfaced here as a discoverable plugin command. Run it end-to-end.

## Steps

1. **Verify Memsy is reachable** — call `memsy_health`. If it fails, hand off to the `memsy-setup` skill / direct the user to `/memsy-doctor` and stop. Do not proceed with the rest of the workflow until the MCP is healthy.

2. **Roles** — call `memsy_list_roles`:
   - If the org has roles defined, show them as a numbered list (`name`, `role_id`, `focus`).
   - If empty, suggest sensible defaults based on what the user does (ask: "What's your role? e.g. Software Engineer, Designer, PM"). For each new role, call `memsy_create_role` with a one-sentence `focus` derived from the role name.
   - Ask which role(s) should be the user's defaults (multi-select fine).

3. **Teams** — same pattern with `memsy_list_teams` / `memsy_create_team`. Ask which team(s) to default to.

4. **Actor identity** — read `memsy://actor/current` and explain the current value + source:
   - `env` → MEMSY_ACTOR_ID is set in the shell (good, pinned).
   - `profile` → already pinned in `~/.memsy/config.json` (good).
   - `derived-git` / `derived-os` → auto-derived from git email or `$USER@hostname` (works, but unstable across machines).

   Offer the user three choices:
   - **Agent-style** (recommended for multi-host users): `claude-code`, `cursor`, `vscode`, `zed`, `cline`. Lets them later filter "what did I save via Claude Code last week?".
   - **Personal handle** (recommended for single-host users): `alex-dev`, first name, etc.
   - **Keep current** — leave the derived value alone.

5. **Persist** — call `memsy_set_defaults` with the chosen roles, teams, actor_id, and `persist: "global"` (writes to `~/.memsy/config.json`). If the user prefers project-only scope, pass `persist: "project"` instead.

6. **Confirm** — print back:
   ```
   ✓ Defaults saved (<persist scope>)
     Roles:   <role names>
     Teams:   <team names>
     Actor:   <actor_id> (<source>)
   ```

7. **Verify** — suggest the user run `/memsy-doctor` to see the new state, and try `/memsy <some past topic>` to confirm search uses the new defaults.

## Error handling

- If any tool fails: fall back to `memsy-setup` skill / `/memsy-doctor`. Do not write partial defaults.
- If the user wants to cancel mid-walkthrough: persist nothing, acknowledge, stop.
