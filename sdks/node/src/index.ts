// ── Clients ──────────────────────────────────────────────────────────────────
export { MemsyClient } from "./client.js";
export type { MemsyClientOptions, SearchOptions } from "./client.js";
export { MemsyControlClient } from "./control.js";
export type { MemsyControlClientOptions } from "./control.js";

// ── Hot-path sub-resources ───────────────────────────────────────────────────
export { OrgsResource } from "./resources/orgs.js";
export type { OrgUpdate } from "./resources/orgs.js";
export { RolesResource } from "./resources/roles.js";
export type { RoleListOptions, RoleUpdate } from "./resources/roles.js";
export { TeamsResource } from "./resources/teams.js";
export type { TeamListOptions, TeamUpdate } from "./resources/teams.js";
export { MemoriesResource } from "./resources/memories.js";
export type { MemoryListOptions } from "./resources/memories.js";

// ── Control-plane sub-resources ──────────────────────────────────────────────
export { KeysResource } from "./control_resources/keys.js";
export type { CreateKeyOptions } from "./control_resources/keys.js";
export { UsageResource } from "./control_resources/usage.js";
export type { UsageTimeseriesOptions } from "./control_resources/usage.js";
export { BillingResource } from "./control_resources/billing.js";
export { EventsResource } from "./control_resources/events.js";
export type { ConsoleEventListOptions } from "./control_resources/events.js";
export { InterestResource } from "./control_resources/interest.js";
export type { InterestExpressOptions } from "./control_resources/interest.js";

// ── Models ───────────────────────────────────────────────────────────────────
export type {
  // Core
  EventPayload,
  EventKind,
  IngestResponse,
  SearchResponse,
  SearchResult,
  SourceEvent,
  SourceMetadata,
  StatusResponse,
  HealthResponse,
  UsageInfo,
  RateLimitInfo,
  // Onboarding
  Org,
  Role,
  Team,
  OnboardingUpdate,
  // Console memories
  MemoryItem,
  MemoryScope,
  MemoryListResponse,
  MemoryStatsResponse,
  // Control plane
  MeResponse,
  DimensionUsage,
  UsageSummaryResponse,
  TimeseriesPoint,
  UsageTimeseriesResponse,
  PaymentMethod,
  UpcomingInvoice,
  BillingSummary,
  Invoice,
  ApiKeyInfo,
  ApiKeyListResponse,
  CreateKeyResponse,
  EventItem,
  EventListResponse,
  ProInterestResponse,
} from "./models.js";

// ── Errors ───────────────────────────────────────────────────────────────────
export {
  MemsyError,
  MemsyConnectionError,
  MemsyAPIError,
  MemsyAuthError,
  MemsyAuthorizationError,
  MemsyFeatureNotAvailableError,
  MemsyOrgIdNotAllowedError,
  MemsySeatRequiredError,
  MemsyOrgLimitReachedError,
  MemsyKeyLimitReachedError,
  MemsyBillingNotEnabledError,
  MemsySeatLimitReachedError,
  MemsyRateLimitError,
  MemsyUsageLimitExceededError,
} from "./errors.js";
