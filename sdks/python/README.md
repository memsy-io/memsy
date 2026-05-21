# memsy

Official Python SDK for [Memsy](https://app.memsy.io) — persistent memory for AI agents and applications.

📚 **Docs**: [docs.memsy.io](https://docs.memsy.io) — guides, API reference, and migration notes.

## Installation

```bash
pip install memsy
```

## Quick Start

```python
import os
from memsy import MemsyClient, EventPayload

client = MemsyClient(
    base_url=os.environ["MEMSY_BASE_URL"],
    api_key=os.environ["MEMSY_API_KEY"],
)

# Remember something
client.ingest([EventPayload(
    actor_id="user_1", session_id="session_1",
    kind="user_message", content="I prefer dark mode in all apps",
    role_id="role_eng",       # optional: scope to a role
    team_id="team_platform",  # optional: scope to a team
)])

# Recall it later
results = client.search("user preferences", actor_id="user_1")
for r in results.results:
    print(r.content)
```

That's it. The client handles connection pooling, retries, and response parsing automatically.

---

## Configuration

### Authentication

The SDK uses Bearer token authentication. Pass your API key when creating the client:

```python
client = MemsyClient(
    base_url=os.environ["MEMSY_BASE_URL"],
    api_key=os.environ["MEMSY_API_KEY"],
)
```

### Retry Configuration

Configure retry behavior for rate-limited requests:

```python
client = MemsyClient(
    base_url=os.environ["MEMSY_BASE_URL"],
    api_key=os.environ["MEMSY_API_KEY"],
    max_retries=3,         # default: 3
    retry_backoff=1.0,     # default: 1.0 seconds
    timeout=30.0,          # default: 30.0 seconds
)
```

---

## API Reference — `MemsyClient` (hot path)

### `ingest(events)`

Store a batch of events. Events are processed asynchronously into long-term memories.
Organization context is inferred from the API key — do not pass `org_id`.

```python
result = client.ingest([
    EventPayload(
        actor_id="user_1", session_id="s1",
        kind="user_message", content="...",
        role_id="engineer",  # optional — used by hierarchical promotion
        team_id="platform",  # optional — used by hierarchical promotion
    ),
    EventPayload(
        actor_id="user_1", session_id="s1",
        kind="assistant_message", content="...",
    ),
])
print(result.event_ids)  # ['01J...', '01J...']
```

### `EventPayload` fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actor_id` | `str` | Yes | End-user or agent identifier |
| `session_id` | `str` | Yes | Conversation/session identifier |
| `kind` | `str` | Yes | `user_message`, `assistant_message`, `tool_result`, `app_event` |
| `content` | `str` | Yes | Text content of the event |
| `ts` | `str` | No | ISO 8601 timestamp (server uses `now()` if omitted) |
| `metadata` | `str` | No | JSON-serialised string for custom attributes |
| `role_id` | `str` | No | Scope this event to a specific role in the hierarchy |
| `team_id` | `str` | No | Scope this event to a specific team in the hierarchy |

### `search(query, *, actor_id, limit, threshold, include_source_events)`

Retrieve relevant memories using natural language.

```python
results = client.search(
    query="what does the user prefer?",
    actor_id="user_1",            # optional — restrict to one actor; omit for org-wide search
    limit=10,                     # default: 10
    threshold=0.0,                # minimum relevance score, default: 0.0 (no filter)
    include_source_events=True,   # attach source events to each result
)

for r in results.results:
    print(r.score, r.content)

    # Typed metadata properties (always safe — return None/[] if absent)
    print(r.title, r.summary, r.tags)
    print(r.strength, r.confidence)

    # Typed source events when include_source_events=True
    for evt in r.source_events:
        print(evt.event_id, evt.kind, evt.content)
```

### `status(event_ids)`

Check if ingested events have been processed into memories.

```python
status = client.status(event_ids=result.event_ids)
print(status.completed_ids)
print(status.pending_ids)
```

### `health()`

```python
h = client.health()
print(h.status)          # "ok"
print(h.version)         # "2.1.0"
print(h.billing_enabled) # True | False | None
print(h.components)      # {"async_memsy": "ok", "sync_memsy": "ok", ...}
```

---

## Onboarding Hierarchy

`MemsyClient` exposes three sub-resource accessors for managing the org → role → team hierarchy
that scopes memory promotion. Deleting a record removes only the customization — memories with
that `org_id` / `role_id` / `team_id` are unaffected.

### `client.orgs`

```python
# Create / get / update
org = client.orgs.create(org_id="my-org", name="My Org", focus="AI assistant context")
org = client.orgs.get("my-org")
org = client.orgs.update("my-org", focus="Updated focus")

# Regenerate the LLM-written promotion_prompt
org = client.orgs.regenerate_prompt("my-org")

# List all visible orgs
orgs = client.orgs.list()

# Delete customization record
client.orgs.delete("my-org")
```

### `client.roles`

```python
role = client.roles.create(org_id="my-org", name="Engineering", focus="Software engineers")
roles = client.roles.list(org_id="my-org")
role = client.roles.get(role_id="role-id", org_id="my-org")
role = client.roles.update("role-id", "my-org", name="Senior Engineering")
role = client.roles.regenerate_prompt("role-id", "my-org")
client.roles.delete("role-id", "my-org")
```

### `client.teams`

```python
team = client.teams.create(org_id="my-org", name="Platform", focus="Infrastructure team")
teams = client.teams.list(org_id="my-org")
team = client.teams.get(team_id="team-id", org_id="my-org")
team = client.teams.update("team-id", "my-org", focus="Platform & infra")
team = client.teams.regenerate_prompt("team-id", "my-org")
client.teams.delete("team-id", "my-org")
```

---

## Console Memories

Browse memories stored for the authenticated org via `client.memories`:

```python
# Paginated list with filters
page = client.memories.list(
    kind="semantic",         # semantic | episodic | procedural
    type="preference",       # fact | preference | norm | decision | ...
    sort="observed_at_desc", # default
    limit=50,
    offset=0,
)
print(page.total, len(page.items))

# Aggregate statistics
stats = client.memories.stats()
print(stats.total_memories, stats.avg_confidence)
print(stats.by_type)    # {"fact": 12, "preference": 5, ...}

# Retrieve a single memory by UUID
item = client.memories.get("550e8400-e29b-41d4-a716-446655440000")
print(item.text, item.strength, item.confidence)
```

---

## Control-Plane Client (`MemsyControlClient`)

The control-plane is a separate API service that manages account settings, billing, API keys,
usage reporting, and raw event browsing. Use a second client pointed at the control-plane URL:

```python
from memsy import MemsyControlClient

control = MemsyControlClient(
    base_url=os.environ["MEMSY_CONTROL_URL"],  # e.g. https://api.memsy.io/api
    api_key=os.environ["MEMSY_API_KEY"],
)
```

### `control.me()`

Returns identity information for the authenticated caller:

```python
me = control.me()
print(me.email, me.tier, me.org_id, me.is_billing_admin)
```

### `control.events.list()`

Browse raw ingested events (requires assigned seat):

```python
events = control.events.list(
    actor_id="user_1",      # optional filter
    session_id="sess_abc",  # optional filter
    kind="user_message",    # optional filter
    sort="ts_desc",         # default
    limit=50,
)
for e in events.items:
    print(e.ts, e.actor_id, e.content)
```

### `control.usage` (admin-only)

```python
summary = control.usage.summary()
print(summary.tier, summary.period_start, summary.period_end)
for dim in summary.dimensions:
    print(f"{dim.dimension}: {dim.used} / {dim.limit}")

ts = control.usage.timeseries(dimension="api_calls", granularity="daily")
for point in ts.data:
    print(point.date, point.quantity)
```

### `control.billing` (admin-only)

```python
billing = control.billing.summary()
print(billing.tier, billing.purchased_seats, billing.subscription_status)
if billing.payment_method:
    print(billing.payment_method.brand, billing.payment_method.last4)

invoices = control.billing.invoices()
for inv in invoices:
    print(inv.status, inv.amount_due, inv.currency)
```

### `control.keys` (admin-only)

```python
# List existing keys
resp = control.keys.list()
print(resp.active_count, resp.max_keys)
for key in resp.keys:
    print(key.key_id, key.prefix, key.scopes, key.is_active)

# Create a new key — raw_key is returned ONCE, store it securely
new_key = control.keys.create("ci-pipeline", scopes=["read"])
print(new_key.raw_key)

# Per-key usage records
records = control.keys.usage(new_key.key_id)

# Delete a key by ID
control.keys.delete(new_key.key_id)
```

### `control.interest`

```python
# Express Pro interest
control.interest.express(
    email="you@company.com", name="Your Name",
    company="Acme", use_case="AI assistant memory"
)

# Check status
already_expressed = control.interest.status()  # bool
```

---

## Usage Tracking

The SDK automatically parses usage and rate limit headers from every response:

```python
result = client.search("test query")

if result.usage:
    print(f"Plan: {result.usage.plan}")
    print(f"API calls: {result.usage.api_calls} / {result.usage.api_calls_limit}")

if result.rate_limit:
    print(f"Rate limit remaining: {result.rate_limit.remaining}")
```

---

## Error Handling

```python
from memsy.exceptions import (
    AuthenticationError,
    AuthorizationError,
    BillingNotEnabledError,
    FeatureNotAvailable,
    KeyLimitReachedError,
    OrgIdNotAllowedError,
    OrgLimitReachedError,
    RateLimitExceeded,
    SeatLimitReachedError,
    SeatRequiredError,
    UsageLimitExceeded,
    MemsyConnectionError,
    MemsyAPIError,
)

try:
    results = client.search("preferences")
except AuthenticationError:
    print("Invalid API key")
except AuthorizationError as e:
    print(f"Missing required scope: {e.required_scope}")
except SeatRequiredError:
    print("This endpoint requires an assigned seat")
except FeatureNotAvailable as e:
    print(f"Feature '{e.feature}' not available on {e.current_tier}")
    print(f"Upgrade at: {e.upgrade_url}")
except OrgIdNotAllowedError:
    print("Free-tier orgs cannot pass org_id in request bodies")
except OrgLimitReachedError as e:
    print(f"Org limit: {e.current}/{e.limit}")
except KeyLimitReachedError as e:
    print(f"API key limit: {e.current}/{e.limit}")
except BillingNotEnabledError as e:
    print(f"Express interest at: {e.interest_path}")
except SeatLimitReachedError as e:
    print(f"Seats: {e.assigned_seats} assigned / {e.purchased_seats} purchased")
except RateLimitExceeded as e:
    print(f"Rate limited — retry after {e.retry_after}s")
except UsageLimitExceeded as e:
    print(f"Quota exceeded for {e.dimension}: {e.current}/{e.limit}")
except MemsyConnectionError:
    print("Could not reach Memsy")
except MemsyAPIError as e:
    print(f"API error {e.status_code}: {e.detail}")
```

### Exception Hierarchy

```
MemsyError
├── MemsyConnectionError      # Network/timeout errors
└── MemsyAPIError             # Non-2xx responses
    ├── AuthenticationError   # 401 — Invalid/missing API key
    ├── AuthorizationError    # 403 — Wrong scope or admin-required
    ├── FeatureNotAvailable   # 403 — Feature gated by tier
    ├── OrgIdNotAllowedError  # 400 — org_id sent on free tier
    ├── SeatRequiredError     # 403 — Endpoint needs an assigned seat
    ├── OrgLimitReachedError  # 403 — Tier org cap hit
    ├── KeyLimitReachedError  # 403 — Tier API key cap hit
    ├── BillingNotEnabledError# 403 — Billing endpoint on free tier
    ├── SeatLimitReachedError # 409 — Seat purchase limit reached
    ├── RateLimitExceeded     # 429 — Rate limit hit
    └── UsageLimitExceeded    # 429 — Quota exceeded
```

---

## Auto-Retry

The SDK automatically retries on 429 (rate limit) responses with exponential backoff:

- Default: 3 retries with 1.0s base backoff
- Respects `Retry-After` header if present
- After max retries, raises `RateLimitExceeded`

---

## Async Usage

All clients have async equivalents: `AsyncMemsyClient` and `AsyncMemsyControlClient`.

```python
import asyncio
from memsy import AsyncMemsyClient, AsyncMemsyControlClient, EventPayload

async def main():
    async with AsyncMemsyClient(base_url="https://...", api_key="msy_...") as client:
        await client.ingest([EventPayload(
            actor_id="user_1", session_id="s1",
            kind="user_message", content="I prefer dark mode",
            role_id="role_eng",
        )])
        results = await client.search("user preferences")

        # Sub-resources are also async
        orgs = await client.orgs.list()
        stats = await client.memories.stats()

    async with AsyncMemsyControlClient(base_url="https://.../api", api_key="msy_...") as control:
        me = await control.me()
        events = await control.events.list()

asyncio.run(main())
```

---

## Context Manager (auto-close)

```python
with MemsyClient(base_url="...", api_key="msy_...") as client:
    results = client.search("recent topics")
```

---

## Migration Guide

### Upgrading from 0.2.x to 0.3.0

#### `org_id` removed

The deprecated `org_id` parameter is **gone**. Any code passing it will raise `TypeError`.

```python
# Before (0.2.x — deprecated but accepted)
results = client.search("query", org_id="org_1")
client.ingest([EventPayload(org_id="org_1", actor_id="u1", ...)])

# After (0.3.0)
results = client.search("query")
client.ingest([EventPayload(actor_id="u1", ...)])
```

#### `MemsyAuthError` removed

Replace with `AuthenticationError`:

```python
# Before
from memsy import MemsyAuthError

# After
from memsy import AuthenticationError
```

#### New role/team scoping on `EventPayload`

```python
# New in 0.3.0 — optional, ignored if not set
EventPayload(
    actor_id="u1", session_id="s1", kind="user_message", content="...",
    role_id="role_eng",       # optional
    team_id="team_platform",  # optional
)
```

### Upgrading from 0.1.x to 0.2.x

See the [0.2.0 CHANGELOG entry](CHANGELOG.md) for details on the `x-api-key` → `Authorization: Bearer`
header change and the initial `org_id` deprecation.

---

## Publishing (maintainers)

```bash
cd python-sdk
pip install hatch
hatch build
hatch publish
```
