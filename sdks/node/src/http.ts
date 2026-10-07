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
  /**
   * What sits ON TOP of this SDK, when the wrapper is itself the product the
   * user chose — the MCP server passes "mcp".
   *
   * Leave unset in an application. The SDK always identifies itself separately
   * (X-Memsy-Client below), and memsy-core falls back to that, so a plain
   * integration is recorded as the SDK without having to say so.
   */
  surface?: string;
  /**
   * Whether memories from this integration are swept up automatically
   * ("ambient") or saved because someone chose to ("explicit").
   *
   * A CLIENT option rather than per-call, because for an SDK this is a
   * property of the integration: an application that sweeps conversations
   * sweeps all of them, and one with a save button is explicit throughout.
   * The variation is between customers, not between calls — which is exactly
   * why memsy-core has no `sdk` entry in its derivation table and expects the
   * caller to say. Unset leaves capture_mode null on every row.
   */
  captureMode?: "ambient" | "explicit";
}

/**
 * A surface as memsy-core parses it: `name` or `name/detail`.
 *
 * Core splits on the FIRST slash and sanitises each half separately, capping
 * each at 64 — so the slash is structural, and the cap is per segment rather
 * than on the whole string. An earlier version of this pattern applied the
 * per-segment charset to the entire value, which rejected `mcp/0.1.3` and
 * would have rejected `connector/slack` too.
 */
const SURFACE_PATTERN = /^[A-Za-z0-9._-]{1,64}(\/[A-Za-z0-9._-]{1,64})?$/;

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
  protected readonly surface: string | undefined;
  protected readonly captureMode: string | undefined;

  constructor(options: BaseClientOptions) {
    // Validated HERE rather than at request time, and rejected rather than
    // sanitised. A surface fetch cannot encode ("acme-bot™", or anything with
    // a newline) throws inside fetch, which the handler below turns into
    // `MemsyConnectionError: Could not connect to Memsy at <url>` — on EVERY
    // call, search included. Someone would check their network, their URL and
    // their firewall long before suspecting a header they set once.
    //
    // Rejecting beats quietly rewriting: core would store the sanitised form,
    // and "why is my surface called acme-bot-" is a worse puzzle than an
    // error naming the rule at the point the mistake was made.
    // Truthy-gated: surface: "" means NOT CONFIGURED, not a bad value —
    // `process.env.MEMSY_SURFACE ?? ""` is an ordinary way to reach this, and
    // throwing on an unset variable would be hostile. It is omitted from the
    // request below, matching the Python SDK. A non-empty wrong value is a
    // typo and does throw.
    if (options.surface && !SURFACE_PATTERN.test(options.surface)) {
      throw new TypeError(
        `surface must be "name" or "name/detail", each 1-64 characters of ` +
          `[A-Za-z0-9._-]; received ` +
          `${JSON.stringify(options.surface)}. memsy-core rewrites anything else, ` +
          `and a character that cannot be sent as an HTTP header fails every request.`
      );
    }
    if (
      options.captureMode &&
      options.captureMode !== "ambient" &&
      options.captureMode !== "explicit"
    ) {
      throw new TypeError(
        `captureMode must be "ambient" or "explicit"; received ` +
          `${JSON.stringify(options.captureMode)}. Core drops anything else, so the ` +
          `row would silently carry no capture mode at all.`
      );
    }
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.surface = options.surface;
    this.captureMode = options.captureMode;
  }

  /** @internal */
  async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<RequestResult<T>> {
    const url = `${this.baseUrl}${path}${buildQueryString(options.query)}`;
    // Provenance, two levels. X-Memsy-Client is the LIBRARY and is always true
    // of this request; X-Memsy-Surface is what sits on top and only a wrapper
    // sets it. memsy-core resolves surface-then-client, so a plain application
    // is recorded as sdk/node-sdk while the very same SDK under the MCP server
    // is recorded as mcp/mcp — without this layer knowing which it is in.
    //
    // Sent on every request, not just /ingest. Core reads them only where
    // provenance is recorded, and one header block beats a per-route rule.
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "X-Memsy-Client": "node-sdk",
    };
    // Truthiness, not `!== undefined`: surface: "" is a caller mistake rather
    // than a claim, and sending it empty would differ from the Python SDK,
    // which omits it. Harmless either way — core cannot parse an empty header
    // so it falls through to X-Memsy-Client — but two SDKs disagreeing on the
    // wire is the kind of difference that costs an afternoon later.
    if (this.surface) headers["X-Memsy-Surface"] = this.surface;
    // Only core can derive capture_mode for a KNOWN surface; `sdk` has no
    // entry in its table by design, so an SDK that does not send this leaves
    // capture_mode null on every row it produces.
    if (this.captureMode) headers["X-Memsy-Capture"] = this.captureMode;
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
