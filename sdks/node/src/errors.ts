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

export class MemsyAPIError extends MemsyError {
  readonly statusCode: number;
  readonly detail: string;
  readonly errorCode: string | null;
  readonly response: Response | null;

  constructor(
    message: string,
    statusCode: number,
    detail: string = "",
    errorCode: string | null = null,
    response: Response | null = null
  ) {
    super(message);
    this.name = "MemsyAPIError";
    this.statusCode = statusCode;
    this.detail = detail;
    this.errorCode = errorCode;
    this.response = response;
  }
}

export class MemsyAuthError extends MemsyAPIError {
  constructor(detail: string, response: Response | null = null, errorCode: string | null = null) {
    super(`Authentication failed: ${detail}`, 401, detail, errorCode, response);
    this.name = "MemsyAuthError";
  }
}

export class MemsyAuthorizationError extends MemsyAPIError {
  readonly requiredScope: string | null;

  constructor(
    detail: string,
    statusCode: number = 403,
    errorCode: string | null = null,
    requiredScope: string | null = null,
    response: Response | null = null
  ) {
    super(`Authorization failed: ${detail}`, statusCode, detail, errorCode, response);
    this.name = "MemsyAuthorizationError";
    this.requiredScope = requiredScope;
  }
}

export class MemsyFeatureNotAvailableError extends MemsyAPIError {
  readonly feature: string | null;
  readonly currentTier: string | null;
  readonly upgradeUrl: string | null;

  constructor(
    detail: string,
    feature: string | null = null,
    currentTier: string | null = null,
    upgradeUrl: string | null = null,
    errorCode: string | null = null,
    response: Response | null = null
  ) {
    super(`Feature not available: ${detail}`, 403, detail, errorCode, response);
    this.name = "MemsyFeatureNotAvailableError";
    this.feature = feature;
    this.currentTier = currentTier;
    this.upgradeUrl = upgradeUrl;
  }
}

export class MemsyOrgIdNotAllowedError extends MemsyAPIError {
  constructor(detail: string, errorCode: string | null = null, response: Response | null = null) {
    super(`org_id not allowed on this tier: ${detail}`, 400, detail, errorCode, response);
    this.name = "MemsyOrgIdNotAllowedError";
  }
}

export class MemsySeatRequiredError extends MemsyAPIError {
  constructor(detail: string, errorCode: string | null = null, response: Response | null = null) {
    super(`Seat required: ${detail}`, 403, detail, errorCode, response);
    this.name = "MemsySeatRequiredError";
  }
}

export class MemsyOrgLimitReachedError extends MemsyAPIError {
  readonly limit: number | null;
  readonly current: number | null;

  constructor(
    detail: string,
    limit: number | null = null,
    current: number | null = null,
    errorCode: string | null = null,
    response: Response | null = null
  ) {
    super(`Org limit reached: ${detail}`, 403, detail, errorCode, response);
    this.name = "MemsyOrgLimitReachedError";
    this.limit = limit;
    this.current = current;
  }
}

export class MemsyKeyLimitReachedError extends MemsyAPIError {
  readonly limit: number | null;
  readonly current: number | null;

  constructor(
    detail: string,
    limit: number | null = null,
    current: number | null = null,
    errorCode: string | null = null,
    response: Response | null = null
  ) {
    super(`API key limit reached: ${detail}`, 403, detail, errorCode, response);
    this.name = "MemsyKeyLimitReachedError";
    this.limit = limit;
    this.current = current;
  }
}

export class MemsyBillingNotEnabledError extends MemsyAPIError {
  readonly interestPath: string | null;

  constructor(
    detail: string,
    interestPath: string | null = null,
    errorCode: string | null = null,
    response: Response | null = null
  ) {
    super(`Billing not enabled: ${detail}`, 403, detail, errorCode, response);
    this.name = "MemsyBillingNotEnabledError";
    this.interestPath = interestPath;
  }
}

export class MemsySeatLimitReachedError extends MemsyAPIError {
  readonly purchasedSeats: number | null;
  readonly assignedSeats: number | null;
  readonly pendingInvites: number | null;

  constructor(
    detail: string,
    purchasedSeats: number | null = null,
    assignedSeats: number | null = null,
    pendingInvites: number | null = null,
    errorCode: string | null = null,
    response: Response | null = null
  ) {
    super(`Seat limit reached: ${detail}`, 409, detail, errorCode, response);
    this.name = "MemsySeatLimitReachedError";
    this.purchasedSeats = purchasedSeats;
    this.assignedSeats = assignedSeats;
    this.pendingInvites = pendingInvites;
  }
}

export class MemsyRateLimitError extends MemsyAPIError {
  readonly retryAfter: number | null;

  constructor(
    detail: string,
    retryAfter: number | null = null,
    errorCode: string | null = null,
    response: Response | null = null
  ) {
    super(`Rate limit exceeded: ${detail}`, 429, detail, errorCode, response);
    this.name = "MemsyRateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class MemsyUsageLimitExceededError extends MemsyAPIError {
  readonly dimension: string | null;
  readonly current: number | null;
  readonly limit: number | null;
  readonly upgradeUrl: string | null;

  constructor(
    detail: string,
    dimension: string | null = null,
    current: number | null = null,
    limit: number | null = null,
    upgradeUrl: string | null = null,
    errorCode: string | null = null,
    response: Response | null = null
  ) {
    super(`Usage limit exceeded: ${detail}`, 429, detail, errorCode, response);
    this.name = "MemsyUsageLimitExceededError";
    this.dimension = dimension;
    this.current = current;
    this.limit = limit;
    this.upgradeUrl = upgradeUrl;
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

  let detail = "";
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

  if (status === 400 && errorCode === "org_id_not_allowed") {
    return new MemsyOrgIdNotAllowedError(detail, errorCode, response);
  }

  if (status === 401) {
    return new MemsyAuthError(detail, response, errorCode);
  }

  if (status === 403) {
    if (errorCode === "feature_not_available") {
      return new MemsyFeatureNotAvailableError(
        detail,
        pickStringOrNull(body, "feature"),
        pickStringOrNull(body, "current_tier"),
        pickStringOrNull(body, "upgrade_url"),
        errorCode,
        response
      );
    }
    if (errorCode === "seat_required") {
      return new MemsySeatRequiredError(detail, errorCode, response);
    }
    if (errorCode === "org_limit_reached") {
      return new MemsyOrgLimitReachedError(
        detail,
        pickNumberOrNull(body, "limit"),
        pickNumberOrNull(body, "current"),
        errorCode,
        response
      );
    }
    if (errorCode === "key_limit_reached") {
      return new MemsyKeyLimitReachedError(
        detail,
        pickNumberOrNull(body, "limit"),
        pickNumberOrNull(body, "current"),
        errorCode,
        response
      );
    }
    if (errorCode === "billing_not_enabled") {
      return new MemsyBillingNotEnabledError(
        detail,
        pickStringOrNull(body, "interest_path"),
        errorCode,
        response
      );
    }
    if (
      errorCode === "wrong_scope" ||
      errorCode === "insufficient_scope" ||
      lowerDetail.includes("scope")
    ) {
      return new MemsyAuthorizationError(
        detail,
        status,
        errorCode,
        pickStringOrNull(body, "required_scope") || pickStringOrNull(body, "scope"),
        response
      );
    }
    return new MemsyAuthorizationError(detail, status, errorCode, null, response);
  }

  if (status === 409 && errorCode === "seat_limit_reached") {
    return new MemsySeatLimitReachedError(
      detail,
      pickNumberOrNull(body, "purchased_seats"),
      pickNumberOrNull(body, "assigned_seats"),
      pickNumberOrNull(body, "pending_invites"),
      errorCode,
      response
    );
  }

  if (status === 429) {
    const retryAfterRaw = response.headers.get("Retry-After");
    const retryAfter = retryAfterRaw ? parseFloat(retryAfterRaw) : NaN;
    const retryAfterValue = Number.isFinite(retryAfter) ? retryAfter : null;
    if (errorCode === "usage_limit_exceeded" || lowerDetail.includes("quota")) {
      return new MemsyUsageLimitExceededError(
        detail,
        pickStringOrNull(body, "dimension"),
        pickNumberOrNull(body, "current"),
        pickNumberOrNull(body, "limit"),
        pickStringOrNull(body, "upgrade_url"),
        errorCode,
        response
      );
    }
    return new MemsyRateLimitError(detail, retryAfterValue, errorCode, response);
  }

  return new MemsyAPIError(`Memsy API error ${status}: ${detail}`, status, detail, errorCode, response);
}
