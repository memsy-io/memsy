export { MemsyClient } from "./client.js";
export type { MemsyClientOptions, SearchOptions } from "./client.js";

export type {
  EventPayload,
  EventKind,
  IngestResponse,
  SearchResponse,
  SearchResult,
  SourceEvent,
  StatusResponse,
  HealthResponse,
  ClearResponse,
  UsageInfo,
  RateLimitInfo,
} from "./models.js";

export {
  MemsyError,
  MemsyAPIError,
  MemsyConnectionError,
  MemsyAuthError,
  MemsyRateLimitError,
} from "./errors.js";
