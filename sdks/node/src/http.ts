import {
  type RateLimitInfo,
  type UsageInfo,
  parseRateLimitInfo,
  parseUsageInfo,
} from "./models.js";
import {
  classifyError,
  MemsyConnectionError,
  MemsyRateLimitError,
} from "./errors.js";

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface BaseClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export interface RequestResult<T> {
  data: T;
  usage: UsageInfo | null;
  rateLimit: RateLimitInfo | null;
}

function isUsagePopulated(u: UsageInfo): boolean {
  return Object.values(u).some((v) => v !== null);
}

function isRateLimitPopulated(r: RateLimitInfo): boolean {
  return r.limit !== null || r.remaining !== null;
}

function buildQueryString(query: RequestOptions["query"]): string {
  if (!query) return "";
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared HTTP base for both MemsyClient (hot path) and MemsyControlClient.
 *
 * Mirrors the Python SDK's HttpCoreMixin: header parsing, retry-on-429
 * with `Retry-After` honoring, exponential backoff, and typed-error
 * classification via classifyError().
 */
export class BaseHttpClient {
  protected readonly baseUrl: string;
  protected readonly apiKey: string;
  protected readonly timeoutMs: number;
  protected readonly maxRetries: number;

  constructor(options: BaseClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /** @internal */
  async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<RequestResult<T>> {
    const url = `${this.baseUrl}${path}${buildQueryString(options.query)}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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

      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfterRaw = response.headers.get("Retry-After");
        const retryAfter = retryAfterRaw ? parseFloat(retryAfterRaw) : NaN;
        const waitMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : 1000 * Math.pow(2, attempt);
        await sleep(waitMs);
        continue;
      }

      const usageRaw = parseUsageInfo(response.headers);
      const rateLimitRaw = parseRateLimitInfo(response.headers);
      const usage = isUsagePopulated(usageRaw) ? usageRaw : null;
      const rateLimit = isRateLimitPopulated(rateLimitRaw) ? rateLimitRaw : null;

      if (!response.ok) {
        throw await classifyError(response);
      }

      if (response.status === 204) {
        return { data: null as T, usage, rateLimit };
      }

      const text = await response.text();
      const data = (text ? JSON.parse(text) : null) as T;
      return { data, usage, rateLimit };
    }

    throw new MemsyRateLimitError("Max retries exceeded");
  }
}
