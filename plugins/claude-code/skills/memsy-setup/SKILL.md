---
name: memsy-setup
description: Use this skill when Memsy MCP tools are unavailable or returning errors — symptoms include "tool not found", "memsy_health unavailable", 401/403 auth errors from Memsy, "ECONNREFUSED" or network errors to api.memsy.io, or when the user explicitly asks to "set up memsy", "install memsy", "memsy isn't working", "memsy auth error", or similar. Diagnoses the failure mode and walks the user through the fix without retrying the broken tool blindly.
---

The user is hitting a Memsy failure or asking for setup help. Diagnose, then fix.

## 1. Detect failure mode

Map the symptom to the cause:

| Symptom | Cause |
|---|---|
| "tool `memsy_*` not found" / no Memsy tools available in toolkit | MCP server didn't load. Plugin not installed / enabled, or `.mcp.json` misconfigured. |
| 401 / 403 / "invalid API key" / "API key required" | `MEMSY_API_KEY` missing, wrong, or revoked. |
| `ECONNREFUSED` / `ENOTFOUND` / "fetch failed" | Network issue, wrong `MEMSY_BASE_URL`, or local API not running (dev). |
| "Node not found" / "command not found: npx" | Node 18+ not on the PATH of the shell that launched Claude Code. |
| "Cannot find module '@memsy-io/mcp'" | `npx -y @memsy-io/mcp` failed — package not on npm yet, or local symlink missing. |
| Tools available but every call hangs | MCP process spawned but stuck. Restart Claude Code. |

## 2. Walk the user through the fix — in this order

### (a) Confirm plugin is enabled

```sh
claude plugin list
```

Should show `memsy` enabled. If not:
- Not listed → `claude plugin marketplace add memsy-io/memsy` then `claude plugin install memsy@memsy`.
- Listed but disabled → `claude plugin enable memsy`.

### (b) Set the API key in the shell that launches Claude Code

```sh
export MEMSY_API_KEY=msy_...
# add to ~/.zshrc or ~/.bashrc to persist
```

Get a key at <https://app.memsy.io>. **Restart Claude Code** — MCP children inherit the launch env, so a key set after launch doesn't help.

### (c) Local-dev mode (only if `@memsy-io/mcp` isn't on npm yet)

```sh
cd /path/to/memsy/mcp
npm install
npm run build      # produces dist/server.js — this is what install.sh --dev points at

cd /path/to/memsy/plugins/claude-code
./install.sh --dev /path/to/memsy
```

Then restart Claude Code.

### (d) Verify

In a fresh Claude Code session:

```
/memsy-doctor
```

Should print `Status: ok` with version, profile, actor, session. If still failing, show the doctor output and re-diagnose.

## 3. After the fix

- Tell the user: "Memsy is set up. Re-run whatever you were trying to do."
- If their original request was a recall (`memsy-recall` skill) or store (`memsy-remember`), offer to re-attempt now.
- Suggest `/memsy-setup` for first-time defaults (roles, teams, actor identity).

## Hard rules

- **Do NOT pretend to call Memsy tools while diagnosing.** If the tools aren't there, say so plainly.
- **Do NOT retry the broken call in a loop** hoping it works. Fix the root cause first.
- **Do NOT fabricate substitute answers** ("based on what I remember from this session..."). Be honest that memory isn't available.
- **Do NOT skip `restart Claude Code`** — env vars set after launch don't reach the MCP child.
