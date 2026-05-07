export class MemsyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemsyError";
  }
}

export class MemsyConnectionError extends MemsyError {
  constructor(message: string) {
    super(message);
    this.name = "MemsyConnectionError";
  }
}

export interface MemsyAPIErrorBaseOptions {
  errorCode?: string | null;
  response?: Response | null;
}

export class MemsyAPIError extends MemsyError {
  readonly statusCode: number;
  readonly detail: string;
  readonly errorCode: string | null;
  readonly response: Response | null;

  constructor(
    message: string,
    statusCode: number,
    detail: string = "",
    options: MemsyAPIErrorBaseOptions = {}
  ) {
    super(message);
    this.name = "MemsyAPIError";
    this.statusCode = statusCode;
    this.detail = detail;
    this.errorCode = options.errorCode ?? null;
    this.response = options.response ?? null;
  }
}

export class MemsyAuthError extends MemsyAPIError {
  constructor(detail: string, options: MemsyAPIErrorBaseOptions = {}) {
    super(`Authentication failed: ${detail}`, 401, detail, options);
    this.name = "MemsyAuthError";
  }
}

export interface MemsyAuthorizationErrorOptions extends MemsyAPIErrorBaseOptions {
  statusCode?: number;
  requiredScope?: string | null;
}

export class MemsyAuthorizationError extends MemsyAPIError {
  readonly requiredScope: string | null;

  constructor(detail: string, options: MemsyAuthorizationErrorOptions = {}) {
    super(`Authorization failed: ${detail}`, options.statusCode ?? 403, detail, options);
    this.name = "MemsyAuthorizationError";
    this.requiredScope = options.requiredScope ?? null;
  }
}

export interface MemsyFeatureNotAvailableErrorOptions extends MemsyAPIErrorBaseOptions {
  feature?: string | null;
  currentTier?: string | null;
  upgradeUrl?: string | null;
}

export class MemsyFeatureNotAvailableError extends MemsyAPIError {
  readonly feature: string | null;
  readonly currentTier: string | null;
  readonly upgradeUrl: string | null;

  constructor(detail: string, options: MemsyFeatureNotAvailableErrorOptions = {}) {
    super(`Feature not available: ${detail}`, 403, detail, options);
    this.name = "MemsyFeatureNotAvailableError";
    this.feature = options.feature ?? null;
    this.currentTier = options.currentTier ?? null;
    this.upgradeUrl = options.upgradeUrl ?? null;
  }
}

export class MemsyOrgIdNotAllowedError extends MemsyAPIError {
  constructor(detail: string, options: MemsyAPIErrorBaseOptions = {}) {
    super(`org_id not allowed on this tier: ${detail}`, 400, detail, options);
    this.name = "MemsyOrgIdNotAllowedError";
  }
}

export class MemsySeatRequiredError extends MemsyAPIError {
  constructor(detail: string, options: MemsyAPIErrorBaseOptions = {}) {
    super(`Seat required: ${detail}`, 403, detail, options);
    this.name = "MemsySeatRequiredError";
  }
}

export interface MemsyTierLimitErrorOptions extends MemsyAPIErrorBaseOptions {
  limit?: number | null;
  current?: number | null;
}

export class MemsyOrgLimitReachedError extends MemsyAPIError {
  readonly limit: number | null;
  readonly current: number | null;

  constructor(detail: string, options: MemsyTierLimitErrorOptions = {}) {
    super(`Org limit reached: ${detail}`, 403, detail, options);
    this.name = "MemsyOrgLimitReachedError";
    this.limit = options.limit ?? null;
    this.current = options.current ?? null;
  }
}

export class MemsyKeyLimitReachedError extends MemsyAPIError {
  readonly limit: number | null;
  readonly current: number | null;

  constructor(detail: string, options: MemsyTierLimitErrorOptions = {}) {
    super(`API key limit reached: ${detail}`, 403, detail, options);
    this.name = "MemsyKeyLimitReachedError";
    this.limit = options.limit ?? null;
    this.current = options.current ?? null;
  }
}

export interface MemsyBillingNotEnabledErrorOptions extends MemsyAPIErrorBaseOptions {
  interestPath?: string | null;
}

export class MemsyBillingNotEnabledError extends MemsyAPIError {
  readonly interestPath: string | null;

  constructor(detail: string, options: MemsyBillingNotEnabledErrorOptions = {}) {
    super(`Billing not enabled: ${detail}`, 403, detail, options);
    this.name = "MemsyBillingNotEnabledError";
    this.interestPath = options.interestPath ?? null;
  }
}

export interface MemsySeatLimitReachedErrorOptions extends MemsyAPIErrorBaseOptions {
  purchasedSeats?: number | null;
  assignedSeats?: number | null;
  pendingInvites?: number | null;
}

export class MemsySeatLimitReachedError extends MemsyAPIError {
  readonly purchasedSeats: number | null;
  readonly assignedSeats: number | null;
  readonly pendingInvites: number | null;

  constructor(detail: string, options: MemsySeatLimitReachedErrorOptions = {}) {
    super(`Seat limit reached: ${detail}`, 409, detail, options);
    this.name = "MemsySeatLimitReachedError";
    this.purchasedSeats = options.purchasedSeats ?? null;
    this.assignedSeats = options.assignedSeats ?? null;
    this.pendingInvites = options.pendingInvites ?? null;
  }
}

export interface MemsyRateLimitErrorOptions extends MemsyAPIErrorBaseOptions {
  retryAfter?: number | null;
}

export class MemsyRateLimitError extends MemsyAPIError {
  readonly retryAfter: number | null;

  constructor(detail: string, options: MemsyRateLimitErrorOptions = {}) {
    super(`Rate limit exceeded: ${detail}`, 429, detail, options);
    this.name = "MemsyRateLimitError";
    this.retryAfter = options.retryAfter ?? null;
  }
}

export interface MemsyUsageLimitExceededErrorOptions extends MemsyAPIErrorBaseOptions {
  dimension?: string | null;
  current?: number | null;
  limit?: number | null;
  upgradeUrl?: string | null;
}

export class MemsyUsageLimitExceededError extends MemsyAPIError {
  readonly dimension: string | null;
  readonly current: number | null;
  readonly limit: number | null;
  readonly upgradeUrl: string | null;

  constructor(detail: string, options: MemsyUsageLimitExceededErrorOptions = {}) {
    super(`Usage limit exceeded: ${detail}`, 429, detail, options);
    this.name = "MemsyUsageLimitExceededError";
    this.dimension = options.dimension ?? null;
    this.current = options.current ?? null;
    this.limit = options.limit ?? null;
    this.upgradeUrl = options.upgradeUrl ?? null;
  }
}

interface ErrorBody {
  body: Record<string, unknown>;
  errorCode: string | null;
  detail: string;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

function pickStringOrNull(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function pickNumberOrNull(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === "number" ? v : null;
}

async function readErrorBody(response: Response): Promise<ErrorBody> {
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    return { body: {}, errorCode: null, detail: "" };
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { body: {}, errorCode: null, detail: raw };
  }

  // Unwrap FastAPI's {"detail": {...}} envelope when detail is itself an object.
  const rawDetail = parsed.detail;
  const effective: Record<string, unknown> =
    rawDetail && typeof rawDetail === "object" && !Array.isArray(rawDetail)
      ? { ...parsed, ...(rawDetail as Record<string, unknown>) }
      : parsed;

  let detail: string;
  if (rawDetail && typeof rawDetail === "object" && !Array.isArray(rawDetail)) {
    const d = rawDetail as Record<string, unknown>;
    detail = pickString(d, "message", "error") || pickString(parsed, "message", "error") || raw;
  } else if (typeof rawDetail === "string" && rawDetail) {
    detail = rawDetail;
  } else {
    detail = pickString(parsed, "message", "error") || raw;
  }

  return {
    body: effective,
    errorCode: pickStringOrNull(effective, "error"),
    detail,
  };
}

/**
 * Map a non-2xx Response to the most specific MemsyAPIError subclass.
 *
 * Mirrors `memsy/_http.py::HttpCoreMixin._classify_error` so both SDKs raise
 * the same typed exceptions for the same wire-level error codes.
 */
export async function classifyError(response: Response): Promise<MemsyAPIError> {
  const status = response.status;
  const { body, errorCode, detail } = await readErrorBody(response);
  const lowerDetail = detail.toLowerCase();
  const base = { errorCode, response };

  if (status === 400 && errorCode === "org_id_not_allowed") {
    return new MemsyOrgIdNotAllowedError(detail, base);
  }

  if (status === 401) {
    return new MemsyAuthError(detail, base);
  }

  if (status === 403) {
    if (errorCode === "feature_not_available") {
      return new MemsyFeatureNotAvailableError(detail, {
        ...base,
        feature: pickStringOrNull(body, "feature"),
        currentTier: pickStringOrNull(body, "current_tier"),
        upgradeUrl: pickStringOrNull(body, "upgrade_url"),
      });
    }
    if (errorCode === "seat_required") {
      return new MemsySeatRequiredError(detail, base);
    }
    if (errorCode === "org_limit_reached") {
      return new MemsyOrgLimitReachedError(detail, {
        ...base,
        limit: pickNumberOrNull(body, "limit"),
        current: pickNumberOrNull(body, "current"),
      });
    }
    if (errorCode === "key_limit_reached") {
      return new MemsyKeyLimitReachedError(detail, {
        ...base,
        limit: pickNumberOrNull(body, "limit"),
        current: pickNumberOrNull(body, "current"),
      });
    }
    if (errorCode === "billing_not_enabled") {
      return new MemsyBillingNotEnabledError(detail, {
        ...base,
        interestPath: pickStringOrNull(body, "interest_path"),
      });
    }
    if (
      errorCode === "wrong_scope" ||
      errorCode === "insufficient_scope" ||
      lowerDetail.includes("scope")
    ) {
      return new MemsyAuthorizationError(detail, {
        ...base,
        statusCode: status,
        requiredScope:
          pickStringOrNull(body, "required_scope") || pickStringOrNull(body, "scope"),
      });
    }
    return new MemsyAuthorizationError(detail, { ...base, statusCode: status });
  }

  if (status === 409 && errorCode === "seat_limit_reached") {
    return new MemsySeatLimitReachedError(detail, {
      ...base,
      purchasedSeats: pickNumberOrNull(body, "purchased_seats"),
      assignedSeats: pickNumberOrNull(body, "assigned_seats"),
      pendingInvites: pickNumberOrNull(body, "pending_invites"),
    });
  }

  if (status === 429) {
    const retryAfterRaw = response.headers.get("Retry-After");
    const retryAfter = retryAfterRaw ? parseFloat(retryAfterRaw) : NaN;
    const retryAfterValue = Number.isFinite(retryAfter) ? retryAfter : null;
    if (errorCode === "usage_limit_exceeded" || lowerDetail.includes("quota")) {
      return new MemsyUsageLimitExceededError(detail, {
        ...base,
        dimension: pickStringOrNull(body, "dimension"),
        current: pickNumberOrNull(body, "current"),
        limit: pickNumberOrNull(body, "limit"),
        upgradeUrl: pickStringOrNull(body, "upgrade_url"),
      });
    }
    return new MemsyRateLimitError(detail, { ...base, retryAfter: retryAfterValue });
  }

  return new MemsyAPIError(`Memsy API error ${status}: ${detail}`, status, detail, base);
}
