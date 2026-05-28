---
description: Switch the active Memsy profile / org for this session
argument-hint: <profile name (e.g. work, personal). Leave empty to list profiles.>
---

The user wants to switch active Memsy profile. Target:

`$ARGUMENTS`

Workflow:

1. **If `$ARGUMENTS` is empty**:
   - Call `memsy_list_orgs` (this reads `~/.memsy/config.json` — no network call).
   - Show the user a numbered list:
     ```
     Memsy profiles
     ──────────────
     1. personal   (<org_label from profile>)   ← active
     2. work       (<org_label from profile>)
     ```
   - Ask which profile they want. Do **not** auto-switch.

2. **Otherwise**, call `memsy_use_org` with `profile=$ARGUMENTS`.

3. **On success**, confirm:
   ```
   ✓ Switched to profile: <profile_name>
     Org:       <org_label>
     Base URL:  <base_url>
     Actor:     <actor_id>
   ```
   Note: the switch is in-memory for this MCP session only. To persist as default, set `MEMSY_PROFILE=<name>` in the shell that launches Claude Code.

4. **If the profile is unknown**:
   - Call `memsy_list_orgs` to fetch the actual list.
   - Tell the user `<name>` isn't configured and show the available profiles + how to add one (`~/.memsy/config.json`).

5. **If `memsy_use_org` errors out**: same fallback as `/memsy` — point to `/memsy-doctor`.

Do not invent profile names. If the user types a name that doesn't exist, surface the real list rather than guessing.
