# @memsy-io/memsy

Official Node.js / TypeScript SDK for [Memsy](https://app.memsy.io) — persistent memory for AI agents and applications.

📚 **Docs**: [docs.memsy.io](https://docs.memsy.io) — guides, API reference, and migration notes.

## Installation

```bash
npm install @memsy-io/memsy
# or
pnpm add @memsy-io/memsy
# or
yarn add @memsy-io/memsy
```

Requires Node.js **≥ 18**. Ships with TypeScript types out of the box (ESM + CJS).

## Quick Start

```ts
import { MemsyClient } from "@memsy-io/memsy";

const client = new MemsyClient({
  baseUrl: process.env.MEMSY_BASE_URL!,
  apiKey: process.env.MEMSY_API_KEY!,
});

// Remember something
await client.ingest([
  {
    actorId: "user_1",
    sessionId: "session_1",
    kind: "user_message",
    content: "I prefer dark mode in all apps",
    roleId: "role_eng",        // optional — scope to a role
    teamId: "team_platform",   // optional — scope to a team
  },
]);

// Recall it later
const { results } = await client.search("user preferences", {
  actorId: "user_1",
});

for (const r of results) {
  console.log(r.score, r.content);
}
```

The client handles connection pooling, retries on 429, and response parsing automatically.

---

## Configuration

```ts
const client = new MemsyClient({
  baseUrl: process.env.MEMSY_BASE_URL!,
  apiKey: process.env.MEMSY_API_KEY!,
  timeout: 30_000,       // ms — default: 30s
  maxRetries: 3,         // default: 3
  retryBackoff: 1_000,   // ms — base exponential backoff between 429 retries
});
```

The SDK uses Bearer-token auth. Keys look like `msy_…` and are sent as `Authorization: Bearer <key>`.

---

## API Reference — `MemsyClient` (hot path)

### `ingest(events)`

Store a batch of events. Events are processed asynchronously into long-term memories. Organisation context is inferred from the API key — do not pass `orgId`.

```ts
const { eventIds } = await client.ingest([
  {
    actorId: "user_1", sessionId: "s1",
    kind: "user_message", content: "I love teal.",
    roleId: "engineer",   // optional — used by hierarchical promotion
    teamId: "platform",   // optional — used by hierarchical promotion
  },
  {
    actorId: "user_1", sessionId: "s1",
    kind: "assistant_message", content: "Got it — teal it is.",
  },
]);
```

> ⚠️ `ingest()` requires an **array** of `EventPayload`. Passing a single object throws a typed `TypeError`. Wrap a single event in `[ ]`.

#### `EventPayload` fields

| Field        | Type                                                                       | Required | Description                                                |
|--------------|----------------------------------------------------------------------------|----------|------------------------------------------------------------|
| `actorId`    | `string`                                                                   | yes      | End-user or agent identifier                               |
| `sessionId`  | `string`                                                                   | yes      | Conversation/session identifier                            |
| `kind`       | `"user_message" \| "assistant_message" \| "tool_result" \| "app_event"`     | yes      | Event kind                                                 |
| `content`    | `string`                                                                   | yes      | Text content of the event                                  |
| `ts`         | `string`                                                                   | no       | ISO 8601 timestamp (server uses `now()` if omitted)        |
| `metadata`   | `string`                                                                   | no       | JSON-serialised string for custom attributes               |
| `roleId`     | `string`                                                                   | no       | Scope this event to a specific role in the hierarchy       |
| `teamId`     | `string`                                                                   | no       | Scope this event to a specific team in the hierarchy       |

### `search(query, options?)`

Retrieve relevant memories using natural language.

```ts
const { results } = await client.search("what does the user prefer?", {
  actorId: "user_1",            // optional — restrict to one actor; omit for org-wide search
  limit: 10,                    // default: 10
  threshold: 0.0,               // default: 0.0 — minimum relevance score (no filter)
  includeSourceEvents: true,    // attach source events to each result
});

for (const r of results) {
  console.log(r.score, r.content);
  console.log(r.metadata);       // typed metadata bag
  for (const evt of r.sourceEvents ?? []) {
    console.log(evt.eventId, evt.kind, evt.content);
  }
}
```

### `status(eventIds)`

Check whether ingested events have been processed into memories.

```ts
const s = await client.status(eventIds);
console.log(s.completedIds, s.pendingIds, s.failedIds);
```

For an unknown event ID, the response sets `total` to the number of IDs you queried, populates `unknownIds`, and the per-ID `statuses` map reports `"unknown"`.

### `health()`

```ts
const h = await client.health();
console.log(h.status);          // "ok"
console.log(h.version);         // "2.1.0"
console.log(h.billingEnabled);  // true | false | null
console.log(h.components);      // { async_memsy: "ok", sync_memsy: "ok", ... }
```

---

## Onboarding Hierarchy — `orgs` / `roles` / `teams`

`MemsyClient` exposes three sub-resources for managing the `org → role → team` hierarchy that scopes memory promotion. Deleting a record removes only the customisation — memories tagged with that `orgId` / `roleId` / `teamId` are unaffected.

```ts
// Orgs
const org = await client.orgs.create("my-org", "My Org", "AI assistant context");
await client.orgs.update("my-org", { focus: "Updated focus" });
await client.orgs.regeneratePrompt("my-org");  // re-runs the LLM prompt generator

// Roles (within an org)
const role = await client.roles.create("my-org", "engineer", "Code & deploy context");
await client.roles.list("my-org");

// Teams (within an org)
const team = await client.teams.create("my-org", "platform", "Platform engineering");
await client.teams.list("my-org");
```

---

## Console Memories — `memories`

Browse and inspect the memories produced from your ingested events.

```ts
const page = await client.memories.list({
  actorId: "user_1",                  // optional filter
  kind: "semantic",                   // optional — "episodic" | "semantic" | "procedural"
  limit: 50,
  offset: 0,
});
for (const m of page.items) console.log(m.memoryId, m.text);

const stats = await client.memories.stats();
const item  = await client.memories.get(memoryId);
```

---

## Control-Plane Client — `MemsyControlClient`

Separate client for billing, API keys, usage timeseries, and console events. Use a dashboard / admin key here, not your hot-path key.

```ts
import { MemsyControlClient } from "@memsy-io/memsy";

const control = new MemsyControlClient({
  baseUrl: process.env.MEMSY_CONTROL_BASE_URL!,
  apiKey: process.env.MEMSY_CONTROL_API_KEY!,
});

await control.me();                     // identity + plan
await control.keys.list();              // API keys (admin)
await control.usage.summary();          // monthly usage roll-up (admin)
await control.usage.timeseries({ ... }); // per-day series
await control.billing.invoices();       // billing history (admin)
await control.events.list({ ... });     // console event browser
```

---

## Error Handling

The SDK raises typed errors so you can branch on them without parsing strings:

```ts
import {
  MemsyAPIError,
  MemsyConnectionError,
  MemsyAuthError,
  MemsyAuthorizationError,
  MemsyRateLimitError,
  MemsyUsageLimitExceededError,
  MemsyFeatureNotAvailableError,
} from "@memsy-io/memsy";

try {
  await client.ingest([event]);
} catch (err) {
  if (err instanceof MemsyRateLimitError) {
    // 429 — exponential backoff already exhausted; retry later
  } else if (err instanceof MemsyAuthError) {
    // 401 — invalid or missing API key
  } else if (err instanceof MemsyConnectionError) {
    // network / timeout
  } else if (err instanceof MemsyAPIError) {
    // any other non-2xx; inspect err.statusCode + err.detail
  }
}
```

---

## TypeScript

Every response and request type is exported. The SDK is camelCase end-to-end; the HTTP wire format (snake_case fields like `actor_id`, `event_ids`) is serialised inside the client.

```ts
import type {
  MemsyClientOptions,
  EventPayload,
  IngestResponse,
  SearchOptions,
  SearchResponse,
  SearchResult,
  StatusResponse,
  HealthResponse,
  UsageInfo,
  RateLimitInfo,
} from "@memsy-io/memsy";
```

---

## Usage & rate-limit metadata

Every response carries `usage` and `rateLimit` parsed from `X-Usage-*` and `X-RateLimit-*` headers:

```ts
const r = await client.search("q");
console.log(r.usage?.searchQueries, r.usage?.searchQueriesLimit);
console.log(r.rateLimit?.remaining);
```

---

## Links

- 🌐 [Memsy](https://app.memsy.io)
- 📚 [Documentation](https://docs.memsy.io)
- 🐛 [Issues](https://github.com/memsy-io/memsy/issues)

## License

MIT
