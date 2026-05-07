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

// ── Onboarding (orgs / roles / teams) ────────────────────────────────────────

export interface Org {
  orgId: string;
  name: string;
  focus: string;
  promotionPrompt: string;
  createdAt: string;
  updatedAt: string;
  promptMeta: Record<string, unknown> | null;
}

export interface Role {
  roleId: string;
  orgId: string;
  name: string;
  focus: string;
  promotionPrompt: string;
  createdAt: string;
  updatedAt: string;
  promptMeta: Record<string, unknown> | null;
}

export interface Team {
  teamId: string;
  orgId: string;
  name: string;
  focus: string;
  promotionPrompt: string;
  createdAt: string;
  updatedAt: string;
  promptMeta: Record<string, unknown> | null;
}

interface OnboardingBaseFields {
  name: string;
  focus: string;
  promotion_prompt: string;
  created_at: string;
  updated_at: string;
  prompt_meta?: Record<string, unknown> | null;
}

function readOnboardingBase(d: Record<string, unknown>) {
  const data = d as unknown as OnboardingBaseFields;
  return {
    name: data.name,
    focus: data.focus,
    promotionPrompt: data.promotion_prompt,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    promptMeta: (data.prompt_meta ?? null) as Record<string, unknown> | null,
  };
}

export function parseOrg(d: Record<string, unknown>): Org {
  return { orgId: String(d.org_id), ...readOnboardingBase(d) };
}

export function parseRole(d: Record<string, unknown>): Role {
  return { roleId: String(d.role_id), orgId: String(d.org_id), ...readOnboardingBase(d) };
}

export function parseTeam(d: Record<string, unknown>): Team {
  return { teamId: String(d.team_id), orgId: String(d.org_id), ...readOnboardingBase(d) };
}

// ── Console memories ─────────────────────────────────────────────────────────

export interface MemoryScope {
  level: string;
  actorId: string | null;
  teamId: string | null;
  roleId: string | null;
}

export interface MemoryItem {
  memoryId: string;
  orgId: string;
  scope: MemoryScope;
  type: string;
  kind: string;
  memoryKind: string;
  status: string;
  text: string;
  confidence: number;
  strength: number;
  recallCount: number;
  decayHalfLifeDays: number;
  pinned: boolean;
  tags: string[];
  entityRefs: Record<string, string>[];
  sourceEventIds: string[];
  sourceUrls: string[];
  summary: string | null;
  payload: Record<string, unknown> | null;
  lastRecalledAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  observedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MemoryListResponse {
  items: MemoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface MemoryStatsResponse {
  total: number;
  totalMemories: number;
  activeMemories: number;
  byType: Record<string, number>;
  byKind: Record<string, number>;
  byStatus: Record<string, number>;
  avgConfidence: number;
  avgStrength: number;
  topEntities: Record<string, unknown>[];
  confidenceBuckets: Record<string, unknown>[] | null;
  dateRange: Record<string, string | null> | null;
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function parseMemoryScope(d: Record<string, unknown>): MemoryScope {
  return {
    level: String(d.level),
    actorId: asStringOrNull(d.actor_id),
    teamId: asStringOrNull(d.team_id),
    roleId: asStringOrNull(d.role_id),
  };
}

export function parseMemoryItem(d: Record<string, unknown>): MemoryItem {
  return {
    memoryId: String(d.memory_id),
    orgId: String(d.org_id),
    scope: parseMemoryScope(d.scope as Record<string, unknown>),
    type: String(d.type ?? ""),
    kind: String(d.kind ?? ""),
    memoryKind: String(d.memory_kind ?? ""),
    status: String(d.status ?? ""),
    text: String(d.text ?? ""),
    confidence: Number(d.confidence ?? 0),
    strength: Number(d.strength ?? 0),
    recallCount: Number(d.recall_count ?? 0),
    decayHalfLifeDays: Number(d.decay_half_life_days ?? 0),
    pinned: Boolean(d.pinned),
    tags: (d.tags as string[]) ?? [],
    entityRefs: (d.entity_refs as Record<string, string>[]) ?? [],
    sourceEventIds: (d.source_event_ids as string[]) ?? [],
    sourceUrls: (d.source_urls as string[]) ?? [],
    summary: asStringOrNull(d.summary),
    payload: (d.payload as Record<string, unknown>) ?? null,
    lastRecalledAt: asStringOrNull(d.last_recalled_at),
    effectiveFrom: asStringOrNull(d.effective_from),
    effectiveTo: asStringOrNull(d.effective_to),
    observedAt: asStringOrNull(d.observed_at),
    createdAt: asStringOrNull(d.created_at),
    updatedAt: asStringOrNull(d.updated_at),
  };
}

export function parseMemoryListResponse(d: Record<string, unknown>): MemoryListResponse {
  const rawItems = (d.items as Record<string, unknown>[]) ?? [];
  return {
    items: rawItems.map(parseMemoryItem),
    total: Number(d.total ?? 0),
    limit: Number(d.limit ?? 0),
    offset: Number(d.offset ?? 0),
  };
}

export function parseMemoryStatsResponse(d: Record<string, unknown>): MemoryStatsResponse {
  return {
    total: Number(d.total ?? 0),
    totalMemories: Number(d.total_memories ?? 0),
    activeMemories: Number(d.active_memories ?? 0),
    byType: (d.by_type as Record<string, number>) ?? {},
    byKind: (d.by_kind as Record<string, number>) ?? {},
    byStatus: (d.by_status as Record<string, number>) ?? {},
    avgConfidence: Number(d.avg_confidence ?? 0),
    avgStrength: Number(d.avg_strength ?? 0),
    topEntities: (d.top_entities as Record<string, unknown>[]) ?? [],
    confidenceBuckets: (d.confidence_buckets as Record<string, unknown>[]) ?? null,
    dateRange: (d.date_range as Record<string, string | null>) ?? null,
  };
}

// ── Control plane: identity, billing, usage, keys, events, interest ──────────

export interface MeResponse {
  customerId: string;
  email: string;
  tier: string;
  isSuperadmin: boolean;
  orgId: string;
  isBillingAdmin: boolean;
  userId: string | null;
  orgRole: string | null;
}

export function parseMeResponse(d: Record<string, unknown>): MeResponse {
  return {
    customerId: String(d.customer_id),
    email: String(d.email),
    tier: String(d.tier),
    isSuperadmin: Boolean(d.is_superadmin),
    orgId: String(d.org_id),
    isBillingAdmin: Boolean(d.is_billing_admin),
    userId: asStringOrNull(d.user_id),
    orgRole: asStringOrNull(d.org_role),
  };
}

export interface DimensionUsage {
  dimension: string;
  used: number;
  limit: number | null;
  overageRate: number | null;
}

export interface UsageSummaryResponse {
  orgId: string;
  tier: string;
  periodStart: string;
  periodEnd: string;
  dimensions: DimensionUsage[];
}

export interface TimeseriesPoint {
  date: string;
  dimension: string;
  quantity: number;
}

export interface UsageTimeseriesResponse {
  orgId: string;
  granularity: string;
  data: TimeseriesPoint[];
}

export function parseDimensionUsage(d: Record<string, unknown>): DimensionUsage {
  return {
    dimension: String(d.dimension),
    used: Number(d.used ?? 0),
    limit: typeof d.limit === "number" ? d.limit : null,
    overageRate: typeof d.overage_rate === "number" ? d.overage_rate : null,
  };
}

export function parseUsageSummary(d: Record<string, unknown>): UsageSummaryResponse {
  return {
    orgId: String(d.org_id),
    tier: String(d.tier),
    periodStart: String(d.period_start),
    periodEnd: String(d.period_end),
    dimensions: ((d.dimensions as Record<string, unknown>[]) ?? []).map(parseDimensionUsage),
  };
}

export function parseTimeseriesPoint(d: Record<string, unknown>): TimeseriesPoint {
  return {
    date: String(d.date),
    dimension: String(d.dimension),
    quantity: Number(d.quantity ?? 0),
  };
}

export function parseUsageTimeseries(d: Record<string, unknown>): UsageTimeseriesResponse {
  return {
    orgId: String(d.org_id),
    granularity: String(d.granularity),
    data: ((d.data as Record<string, unknown>[]) ?? []).map(parseTimeseriesPoint),
  };
}

export interface PaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface UpcomingInvoice {
  amountDue: number;
  currency: string;
  periodEnd: number;
}

export interface BillingSummary {
  tier: string;
  purchasedSeats: number;
  assignedSeats: number;
  availableSeats: number;
  stripeCustomerId: string | null;
  paymentMethod: PaymentMethod | null;
  upcomingInvoice: UpcomingInvoice | null;
  subscriptionStatus: string | null;
  billingContact: string | null;
  stripeSubscriptionId: string | null;
}

export interface Invoice {
  id: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  created: string;
  hostedInvoiceUrl: string | null;
}

export function parsePaymentMethod(d: Record<string, unknown>): PaymentMethod {
  return {
    brand: String(d.brand),
    last4: String(d.last4),
    expMonth: Number(d.exp_month ?? 0),
    expYear: Number(d.exp_year ?? 0),
  };
}

export function parseUpcomingInvoice(d: Record<string, unknown>): UpcomingInvoice {
  return {
    amountDue: Number(d.amount_due ?? 0),
    currency: String(d.currency),
    periodEnd: Number(d.period_end ?? 0),
  };
}

export function parseBillingSummary(d: Record<string, unknown>): BillingSummary {
  const pm = d.payment_method as Record<string, unknown> | null | undefined;
  const inv = d.upcoming_invoice as Record<string, unknown> | null | undefined;
  return {
    tier: String(d.tier),
    purchasedSeats: Number(d.purchased_seats ?? 0),
    assignedSeats: Number(d.assigned_seats ?? 0),
    availableSeats: Number(d.available_seats ?? 0),
    stripeCustomerId: asStringOrNull(d.stripe_customer_id),
    paymentMethod: pm ? parsePaymentMethod(pm) : null,
    upcomingInvoice: inv ? parseUpcomingInvoice(inv) : null,
    subscriptionStatus: asStringOrNull(d.subscription_status),
    billingContact: asStringOrNull(d.billing_contact),
    stripeSubscriptionId: asStringOrNull(d.stripe_subscription_id),
  };
}

export function parseInvoice(d: Record<string, unknown>): Invoice {
  return {
    id: String(d.id),
    amountDue: Number(d.amount_due ?? 0),
    amountPaid: Number(d.amount_paid ?? 0),
    currency: String(d.currency),
    status: String(d.status),
    created: String(d.created),
    hostedInvoiceUrl: asStringOrNull(d.hosted_invoice_url),
  };
}

export interface ApiKeyInfo {
  keyId: string;
  prefix: string;
  name: string;
  scopes: string[];
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface ApiKeyListResponse {
  keys: ApiKeyInfo[];
  maxKeys: number;
  activeCount: number;
}

export interface CreateKeyResponse {
  keyId: string;
  rawKey: string;
  prefix: string;
  name: string;
  scopes: string[];
}

export function parseApiKeyInfo(d: Record<string, unknown>): ApiKeyInfo {
  return {
    keyId: String(d.key_id),
    prefix: String(d.prefix),
    name: String(d.name),
    scopes: (d.scopes as string[]) ?? [],
    isActive: Boolean(d.is_active),
    createdAt: String(d.created_at),
    lastUsedAt: asStringOrNull(d.last_used_at),
    expiresAt: asStringOrNull(d.expires_at),
  };
}

export function parseApiKeyListResponse(d: Record<string, unknown>): ApiKeyListResponse {
  return {
    keys: ((d.keys as Record<string, unknown>[]) ?? []).map(parseApiKeyInfo),
    maxKeys: Number(d.max_keys ?? 0),
    activeCount: Number(d.active_count ?? 0),
  };
}

export function parseCreateKeyResponse(d: Record<string, unknown>): CreateKeyResponse {
  return {
    keyId: String(d.key_id),
    rawKey: String(d.raw_key),
    prefix: String(d.prefix),
    name: String(d.name),
    scopes: (d.scopes as string[]) ?? [],
  };
}

export interface EventItem {
  eventId: string;
  orgId: string;
  actorId: string;
  kind: string;
  content: string;
  ts: string;
  sessionId: string | null;
  metadata: Record<string, unknown> | null;
  ingestedAt: string | null;
}

export interface EventListResponse {
  items: EventItem[];
  total: number;
  limit: number;
  offset: number;
}

export function parseEventItem(d: Record<string, unknown>): EventItem {
  return {
    eventId: String(d.event_id),
    orgId: String(d.org_id),
    actorId: String(d.actor_id),
    kind: String(d.kind),
    content: String(d.content),
    ts: String(d.ts),
    sessionId: asStringOrNull(d.session_id),
    metadata: (d.metadata as Record<string, unknown>) ?? null,
    ingestedAt: asStringOrNull(d.ingested_at),
  };
}

export function parseEventListResponse(d: Record<string, unknown>): EventListResponse {
  return {
    items: ((d.items as Record<string, unknown>[]) ?? []).map(parseEventItem),
    total: Number(d.total ?? 0),
    limit: Number(d.limit ?? 0),
    offset: Number(d.offset ?? 0),
  };
}

export interface ProInterestResponse {
  message: string;
}

export function parseProInterestResponse(d: Record<string, unknown>): ProInterestResponse {
  return { message: String(d.message ?? "") };
}
