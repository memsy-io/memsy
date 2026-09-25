# CLAUDE.md

## Branch naming

Every branch starts with your initials and the Jira ticket key, so the Jira ↔ GitHub integration links the branch, commits, and PR to the ticket ([memsy.atlassian.net](https://memsy.atlassian.net), project `KAN`):

```
<initials>/<JIRA-KEY>[-short-slug]
```

Examples: `ns/KAN-28`, `ns/KAN-30-conflict`.

- Initials lowercase; ticket key exactly as in Jira (`KAN-30`, not `kan-30`).
- Slug is optional: lowercase, hyphen-separated, a few words.
- No ticket yet? Create one in Jira first. Agents: if you don't know the ticket key, ask before creating the branch.
