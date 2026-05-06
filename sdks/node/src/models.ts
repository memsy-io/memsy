// ── Usage & Rate Limit ────────────────────────────────────────────────────────

export interface UsageInfo {
  apiCalls: number | null;
  apiCallsLimit: number | null;
  eventsIngested: number | null;
  eventsIngestedLimit: number | null;
  memoryStored: number | null;
  memoryStoredLimit: number | null;
  llmTokens: number | null;
  llmTokensLimit: number | null;
  searchQueries: number | null;
  searchQueriesLimit: number | null;
  plan: string | null;
}

export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
}

function parseIntHeader(headers: Headers, name: string): number | null {
  const v = headers.get(name);
  if (v === null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

export function parseUsageInfo(headers: Headers): UsageInfo {
  return {
    apiCalls: parseIntHeader(headers, "X-Usage-ApiCall"),
    apiCallsLimit: parseIntHeader(headers, "X-Usage-ApiCall-Limit"),
    eventsIngested: parseIntHeader(headers, "X-Usage-EventsIngested"),
    eventsIngestedLimit: parseIntHeader(headers, "X-Usage-EventsIngested-Limit"),
    memoryStored: parseIntHeader(headers, "X-Usage-MemoryStored"),
    memoryStoredLimit: parseIntHeader(headers, "X-Usage-MemoryStored-Limit"),
    llmTokens: parseIntHeader(headers, "X-Usage-LlmTokens"),
    llmTokensLimit: parseIntHeader(headers, "X-Usage-LlmTokens-Limit"),
    searchQueries: parseIntHeader(headers, "X-Usage-SearchQueries"),
    searchQueriesLimit: parseIntHeader(headers, "X-Usage-SearchQueries-Limit"),
    plan: headers.get("X-Plan"),
  };
}

export function parseRateLimitInfo(headers: Headers): RateLimitInfo {
  return {
    limit: parseIntHeader(headers, "X-RateLimit-Limit"),
    remaining: parseIntHeader(headers, "X-RateLimit-Remaining"),
    reset: parseIntHeader(headers, "X-RateLimit-Reset"),
  };
}

// ── Requests ─────────────────────────────────────────────────────────────────

export type EventKind =
  | "user_message"
  | "assistant_message"
  | "tool_result"
  | "app_event";

export interface EventPayload {
  actorId: string;
  sessionId: string;
  kind: EventKind;
  content: string;
  roleId?: string;
  teamId?: string;
  ts?: string;
  metadata?: string;
}

export function serializeEvent(e: EventPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {
    actor_id: e.actorId,
    session_id: e.sessionId,
    kind: e.kind,
    content: e.content,
  };
  if (e.roleId !== undefined) out.role_id = e.roleId;
  if (e.teamId !== undefined) out.team_id = e.teamId;
  if (e.ts !== undefined) out.ts = e.ts;
  if (e.metadata !== undefined) out.metadata = e.metadata;
  return out;
}

// ── Core Responses ────────────────────────────────────────────────────────────

export interface IngestResponse {
  eventIds: string[];
  usage: UsageInfo | null;
  rateLimit: RateLimitInfo | null;
}

export interface SourceEvent {
  eventId: string;
  kind: string;
  content: string;
  ts: string | null;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown> | null;
  sourceEvents: SourceEvent[] | null;
}

export function parseSourceEvents(
  metadata: Record<string, unknown> | null | undefined
): SourceEvent[] | null {
  if (!metadata) return null;
  const raw = metadata.source_events;
  if (!Array.isArray(raw)) return null;
  return raw.map((e: Record<string, unknown>) => ({
    eventId: String(e.event_id ?? ""),
    kind: String(e.kind ?? ""),
    content: String(e.content ?? ""),
    ts: typeof e.ts === "string" ? e.ts : null,
  }));
}

export interface SearchResponse {
  results: SearchResult[];
  usage: UsageInfo | null;
  rateLimit: RateLimitInfo | null;
}

export interface StatusResponse {
  completedIds: string[];
  failedIds: string[];
  pendingIds: string[];
  total: number;
  statuses: Record<string, string> | null;
  usage: UsageInfo | null;
  rateLimit: RateLimitInfo | null;
}

export interface HealthResponse {
  status: string;
  version: string;
  billingEnabled: boolean | null;
  components: Record<string, string> | null;
  usage: UsageInfo | null;
  rateLimit: RateLimitInfo | null;
}

export interface ClearResponse {
  deleted: number;
  usage: UsageInfo | null;
  rateLimit: RateLimitInfo | null;
}
