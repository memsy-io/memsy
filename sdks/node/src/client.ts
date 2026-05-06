import {
  type ClearResponse,
  type EventPayload,
  type HealthResponse,
  type IngestResponse,
  type RateLimitInfo,
  type SearchResponse,
  type StatusResponse,
  type UsageInfo,
  parseRateLimitInfo,
  parseSourceEvents,
  parseUsageInfo,
  serializeEvent,
} from "./models.js";
import {
  MemsyAPIError,
  MemsyAuthError,
  MemsyConnectionError,
  MemsyRateLimitError,
} from "./errors.js";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface MemsyClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface SearchOptions {
  actorId?: string;
  limit?: number;
  threshold?: number;
  includeSourceEvents?: boolean;
}

export class MemsyClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: MemsyClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ data: T; usage: UsageInfo; rateLimit: RateLimitInfo }> {
    const url = `${this.baseUrl}${path}`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: this.headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new MemsyConnectionError(`Request to Memsy timed out: ${url}`);
        }
        throw new MemsyConnectionError(
          `Could not connect to Memsy at ${this.baseUrl}: ${err}`
        );
      }

      const usage = parseUsageInfo(response.headers);
      const rateLimit = parseRateLimitInfo(response.headers);

      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter
          ? parseFloat(retryAfter) * 1000
          : 1000 * Math.pow(2, attempt);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        if (response.status === 401) throw new MemsyAuthError(detail);
        if (response.status === 429)
          throw new MemsyRateLimitError(
            detail,
            parseFloat(response.headers.get("Retry-After") ?? "NaN") || null
          );
        throw new MemsyAPIError(
          `Memsy API error ${response.status}`,
          response.status,
          detail
        );
      }

      if (response.status === 204) {
        return { data: null as T, usage, rateLimit };
      }

      const data = (await response.json()) as T;
      return { data, usage, rateLimit };
    }

    throw new MemsyRateLimitError("Max retries exceeded");
  }

  /**
   * Ingest a batch of events into Memsy.
   */
  async ingest(events: EventPayload[]): Promise<IngestResponse> {
    const { data, usage, rateLimit } = await this.request<{
      event_ids: string[];
    }>("POST", "/ingest", { events: events.map(serializeEvent) });
    return { eventIds: data.event_ids, usage, rateLimit };
  }

  /**
   * Search memories with a natural language query.
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    const body: Record<string, unknown> = {
      query,
      limit: options.limit ?? 10,
      threshold: options.threshold ?? 0.3,
      include_source_events: options.includeSourceEvents ?? false,
    };
    if (options.actorId !== undefined) body.actor_id = options.actorId;

    const { data, usage, rateLimit } = await this.request<{
      results: Array<{
        id: string;
        content: string;
        score: number;
        metadata?: Record<string, unknown>;
      }>;
    }>("POST", "/search", body);

    return {
      results: data.results.map((r) => ({
        id: r.id,
        content: r.content,
        score: r.score,
        metadata: r.metadata ?? null,
        sourceEvents: parseSourceEvents(r.metadata),
      })),
      usage,
      rateLimit,
    };
  }

  /**
   * Check processing status for previously ingested event IDs.
   */
  async status(eventIds: string[]): Promise<StatusResponse> {
    const { data, usage, rateLimit } = await this.request<{
      completedIds: string[];
      failedIds: string[];
      pendingIds: string[];
      total: number;
      statuses?: Record<string, string>;
    }>("POST", "/status", { event_ids: eventIds });

    return {
      completedIds: data.completedIds,
      failedIds: data.failedIds,
      pendingIds: data.pendingIds,
      total: data.total,
      statuses: data.statuses ?? null,
      usage,
      rateLimit,
    };
  }

  /**
   * Check if the Memsy service is healthy.
   */
  async health(): Promise<HealthResponse> {
    const { data, usage, rateLimit } = await this.request<{
      status: string;
      version?: string;
      billing_enabled?: boolean;
      components?: Record<string, string>;
    }>("GET", "/health");

    return {
      status: data.status,
      version: data.version ?? "",
      billingEnabled: data.billing_enabled ?? null,
      components: data.components ?? null,
      usage,
      rateLimit,
    };
  }

  /**
   * Clear tracking state for a container tag.
   */
  async clear(containerTag: string): Promise<ClearResponse> {
    const { data, usage, rateLimit } = await this.request<{ deleted: number }>(
      "DELETE",
      `/clear/${encodeURIComponent(containerTag)}`
    );
    return { deleted: data?.deleted ?? 0, usage, rateLimit };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
