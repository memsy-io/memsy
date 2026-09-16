# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.5] - 2026-09-16

### Added

- **`session_id` and `exclude_session_id` params on `search()`**: scope a search to a
  single conversation, to everything except one conversation, or — by sending neither —
  to all of them, which is the unchanged default. Omitting both produces a request body
  identical to previous releases.

  Memories belonging to no conversation are eligible under *both* filters. Promoted
  role/team/org knowledge is deliberately stored without a conversation because it is
  general rather than from one chat, so scoping a search never hides it.

  The two are mutually exclusive: sending both *non-empty* raises a 422. An empty
  string is treated as unset — and that check runs first — so `session_id=""`
  alongside `exclude_session_id` is a plain exclude search rather than an error. Pass
  `None`, never `""`. To search the current conversation *and* previous ones, send
  neither.

- **`SearchResult.session_id`**: the conversation a memory came from, or `None` when it
  belongs to none. This is what makes a cross-conversation search readable — without it,
  results from the current conversation and earlier ones arrive as one undifferentiated
  list.

### Requires

- A Memsy server with conversation-scoped search deployed. Against an older server the
  new parameters are **silently ignored** — unknown fields are dropped, so the search
  runs unfiltered and returns 200 with no indication the scope was not applied.

## [0.3.4] - 2026-09-16

### Added

- **`client.actors` / `async_client.actors`**: read-only access to the actors that have
  memories in an org, over memsy-core's `GET /actors`. `ActorsResource` and
  `AsyncActorsResource`, plus the `ActorResource` and `ActorListResponse` models and the
  `ActorSort` literal, are exported from `memsy`.

  ```python
  page = client.actors.list(limit=50, sort="last_memory_desc", q="slack")
  for actor in page.items:
      print(actor.actor_id, actor.memory_count)

  actor = client.actors.get("slack:T0B7FKNKKTR:U0B7TN132E9")
  ```

  List-only by design. Actors are **derived** — the server folds the org's memories on
  `actor_id` at read time rather than storing a record — so there is nothing to create,
  rename or delete. Renaming would mean rewriting every event and memory scope carrying
  the old id.

  Three things to know about the shape:

  - **`list()` returns an envelope** (`items`, `total`, `limit`, `offset`, `truncated`),
    not a bare list like `roles.list()`. `total` is the org's distinct-actor count after
    any `q` filter, not the length of the page.
  - **`first_memory_at` / `last_memory_at` are named for the memories, not the actor** —
    they are `min`/`max` of the memories' `created_at`. `last_memory_at` is *not* a
    "last active" signal: only writes advance it, reads never touch it. And
    `first_memory_at` moves *forward* if the oldest memory is reaped or decayed away.
  - **Check `truncated` before trusting any count.** When set, the server hit its
    row-scan cap: the list may be incomplete and every `memory_count` is an under-count.
    This is also why there is no sort by memory count — it would rank on numbers known
    to be wrong, so the server rejects one with a 422.

## [0.3.3] - 2026-09-01

### Added

- **`control.connectors` / `async_control.connectors`**: connector management for Slack,
  Google Drive, S3, Notion, GitHub and OneDrive. Connectors live on the control plane, so
  `ConnectorsResource` hangs off `MemsyControlClient` — *not* `MemsyClient`.

  ```python
  from memsy import MemsyControlClient

  control = MemsyControlClient(base_url="https://api.memsy.io/api", api_key="msy_...")
  connection = control.connectors.create("slack")
  print(connection.authorize_url)   # send the end user here
  control.connectors.wait_until_authorized(connection.connector_id)
  control.connectors.sync(connection.connector_id)
  ```

  Surface: `list_providers()`, `status()`, `create()`, `configure_s3()`, `list()`,
  `get()`, `list_resources()`, `list_branches()`, `picker_config()`,
  `wait_until_authorized()`, `configure_resources()`, `sync()`, `delete()` — each with an
  async twin on `AsyncConnectorsResource`.

  **Two scoping models, and the difference decides who may connect what:**

  - **Org-scoped** — `slack`, `s3`, `notion`, `github`. One shared connection per org.
    Only an org admin, or an API key (which the server treats as a service caller acting
    org-wide), may connect, configure, sync or disconnect one. A seated non-admin member
    gets `AuthorizationError` (403) and may only read.
  - **User-scoped** — `google_drive`, `onedrive`. Each member connects their own account.
    An org admin can see it for auditing but may never mutate it or spend its token.

  `USER_SCOPED_PROVIDERS`, `ORG_SCOPED_PROVIDERS` and `requires_org_admin()` are exported
  as a pre-flight convenience so callers can fail fast or hide UI. **They are not the
  security boundary** — the server is, and it knows about providers newer than any given
  SDK release.

  S3 is not OAuth — `create("s3")` raises `MemsyAPIError` (400); use `configure_s3()`.
  `create()` also raises 403 when a non-admin connects an org-scoped provider, and 409
  when a workspace is already connected.

  Provider, connector and resource ids are percent-encoded as single path segments, so
  one carrying a `/` or `..` cannot resolve outside its collection.

- **New models**: `Connector`, `ConnectorConnection`, `ConnectorResourceItem`,
  `ConnectorStatus`, `ResourceSelection`, `PickerConfig`.

## [0.3.2] - 2026-05-18

### Added
- `role_ids` and `team_ids` params on `search()` for hierarchical recall via role/team-promoted memories


### Changed

- **`search(actor_id=...)` docstring clarified**: omitting `actor_id` now explicitly
  documents as an org-wide search across every actor (matches the server behaviour
  shipped alongside this release). No SDK API change — the parameter has always been
  optional; only the documented meaning of "omitted" is sharper.

## [0.3.0] - 2026-04-29

### Breaking Changes

- **`org_id` removed**: The deprecated `org_id` parameter has been deleted from `search()` and
  the `org_id` field removed from `EventPayload`. Organization context is inferred from the API
  key. Passing `org_id` now raises `TypeError`. *Migration: remove any `org_id=...` kwargs.*

- **`MemsyAuthError` alias removed**: The backwards-compat alias deprecated in 0.2.0 has been
  deleted. Use `AuthenticationError` directly.

### Added

- **`role_id` and `team_id` on `EventPayload`**: Two new optional fields for scoping events to
  a hierarchy role or team. Both are emitted in the request body when set.

  ```python
  EventPayload(
      actor_id="user_1", session_id="s1",
      kind="user_message", content="...",
      role_id="role_eng", team_id="team_platform",
  )
  ```

- **`MemsyControlClient` and `AsyncMemsyControlClient`**: New clients for the Memsy control-plane
  API (`api/`). Exposes account, billing, key management, usage reporting, event browsing, and
  interest endpoints via typed sub-resource accessors.

  ```python
  from memsy import MemsyControlClient

  control = MemsyControlClient(base_url="https://api.memsy.io/api", api_key="msy_...")
  me = control.me()
  events = control.events.list(limit=20)
  summary = control.billing.summary()     # admin-only
  key = control.keys.create("ci-key")     # admin-only
  ```

- **Onboarding sub-resources on `MemsyClient`**: `client.orgs`, `client.roles`, `client.teams`
  expose full CRUD + `regenerate_prompt` for the memsy-core onboarding hierarchy.

  ```python
  client.orgs.create(org_id="my-org", name="My Org", focus="AI assistant for our users")
  roles = client.roles.list(org_id="my-org")
  client.teams.delete(team_id="t1", org_id="my-org")
  ```

- **Console memories sub-resource on `MemsyClient`**: `client.memories` exposes
  `list()`, `stats()`, and `get(memory_id)` for browsing memories in the authenticated org.

  ```python
  stats = client.memories.stats()
  page = client.memories.list(kind="semantic", limit=20)
  item = client.memories.get("uuid-here")
  ```

- **`HealthResponse.billing_enabled` and `HealthResponse.components`**: New optional fields
  surfacing the enriched `/health` response from memsy-core 2.1.0 and the api/ service.

- **`SourceEvent` dataclass and `SearchResult.source_events` property**: When `search()` is
  called with `include_source_events=True`, the result metadata now has a typed accessor:

  ```python
  results = client.search("preferences", include_source_events=True)
  for r in results.results:
      for evt in r.source_events:   # list[SourceEvent]
          print(evt.event_id, evt.content)
  ```

  Additional typed properties on `SearchResult`: `title`, `summary`, `tags`, `entities`,
  `source_event_ids`, `kind`, `type`, `strength`, `confidence`, `observed_at`.

- **New exception classes** for previously unclassified error codes:
  - `OrgIdNotAllowedError` (400) — free-tier guard when `org_id` is sent in request body
  - `SeatRequiredError` (403) — endpoint requires an assigned seat
  - `OrgLimitReachedError` (403) — org tier cap hit; carries `limit`, `current`
  - `KeyLimitReachedError` (403) — API key tier cap hit; carries `limit`, `current`
  - `BillingNotEnabledError` (403) — billing endpoint called on free tier; carries `interest_path`
  - `SeatLimitReachedError` (409) — seat purchase limit reached

- **Shared `HttpCoreMixin` in `memsy/_http.py`**: Error classification, header parsing, and
  detail extraction are now shared between `MemsyClient` and `MemsyControlClient` via a mixin,
  ensuring consistent error handling across both services.

- **New models**: `MeResponse`, `UsageSummaryResponse`, `DimensionUsage`,
  `UsageTimeseriesResponse`, `TimeseriesPoint`, `BillingSummary`, `PaymentMethod`,
  `UpcomingInvoice`, `Invoice`, `ApiKeyInfo`, `ApiKeyListResponse`, `CreateKeyResponse`,
  `EventItemResponse`, `EventListResponse`, `ProInterestResponse`, `OrgResource`,
  `RoleResource`, `TeamResource`, `MemoryScopeInfo`, `MemoryItemResource`,
  `MemoryListResponse`, `MemoryStatsResponse`, `SourceEvent`.

- **204 No Content handling**: `_request` in both clients now returns `None` body (instead of
  raising `JSONDecodeError`) for DELETE endpoints that respond with 204 No Content.

- **Python 3.13 classifier** added to `pyproject.toml`.

### Fixed

- `_extract_detail` now correctly unwraps FastAPI's `{"detail": {"error": ..., "message": ...}}`
  envelope in addition to the flat `{"error": ..., "message": ...}` shape returned by memsy-core's
  `MemsyHTTPError` handler.

---

## [0.2.0] - 2026-03-27

### Added
- **Usage header parsing**: Responses now include `usage` and `rate_limit` attributes parsed from `X-Usage-*` and `X-RateLimit-*` headers
 (#GAP-SDK-03, #GAP-SDK-06)
  ```python
  result = client.search("query")
  print(result.usage.api_calls)  # 100
  print(result.usage.plan)  # "pro"
  print(result.rate_limit.remaining)  # 950
  ```

- **429 retry logic**: Automatic retry with exponential backoff on 429 responses (#GAP-SDK-02)
  - Max 3 retries by default
  - Respects `Retry-After` header
  - Configurable via `max_retries` and `retry_backoff` parameters

- **New error types**: More granular exception handling (#GAP-SDK-04)
  - `AuthenticationError` (401) - Invalid/missing API key
 - `AuthorizationError` (403) - Wrong scope
 - `FeatureNotAvailable` (403) - Feature gated by tier
 - `RateLimitExceeded` (429) - Rate limit hit
 - `UsageLimitExceeded` (429) - Quota exceeded
  - All include `upgrade_url`, `current_tier`, `dimension`, etc. where applicable

- **Retry configuration**: `MemsyClient` now accepts `max_retries` and `retry_backoff` parameters (#GAP-SDK-07)
  ```python
  client = MemsyClient(
      base_url="https://api.memsy.io",
      api_key="***",
      max_retries=5,
      retry_backoff=2.0,
  )
  ```

- **Type checking support**: Added `py.typed` marker for mypy compatibility (#GAP-SDK-12)

### Changed
- **Authentication header**: Changed from `x-api-key` to `Authorization: Bearer` (#GAP-SDK-01)
  - This is the documented standard and is automatically handled
  - No code changes required for users

- **`org_id` removal**: `org_id` parameter is no longer required in request bodies (#GAP-SDK-05)
  - `search()` no longer requires `org_id` parameter
  - `EventPayload` no longer requires `org_id` field
  - Organization is now inferred from API key context
  - **Breaking change**: This is a breaking API change. See migration guide in README.
  - Passing `org_id` still works but is deprecated (will be removed in future version)

  ```python
  # Before (v0.1.x)
  results = client.search("query", org_id="org_1")
  
  # After (v0.2.x)
  results = client.search("query")  # org_id inferred from API key
  ```

- **Error classification**: The `_request` method now properly classifies errors based on response body and headers (#GAP-SDK-04)
  - 403 with `feature_not_available` error code → `FeatureNotAvailable`
  - 429 with `usage_limit_exceeded` error code → `UsageLimitExceeded`
  - 429 with other errors → `RateLimitExceeded`

### Deprecated
- `org_id` parameter in `search()` method - **removed in v0.3.0**
- `org_id` field in `EventPayload` - **removed in v0.3.0**
- `MemsyAuthError` - **removed in v0.3.0**. Use `AuthenticationError` instead
