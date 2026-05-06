export class MemsyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemsyError";
  }
}

export class MemsyAPIError extends MemsyError {
  readonly statusCode: number;
  readonly detail: string;

  constructor(message: string, statusCode: number, detail: string) {
    super(message);
    this.name = "MemsyAPIError";
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

export class MemsyConnectionError extends MemsyError {
  constructor(message: string) {
    super(message);
    this.name = "MemsyConnectionError";
  }
}

export class MemsyAuthError extends MemsyAPIError {
  constructor(detail: string) {
    super("Authentication failed", 401, detail);
    this.name = "MemsyAuthError";
  }
}

export class MemsyRateLimitError extends MemsyAPIError {
  readonly retryAfter: number | null;

  constructor(detail: string, retryAfter: number | null = null) {
    super("Rate limit exceeded", 429, detail);
    this.name = "MemsyRateLimitError";
    this.retryAfter = retryAfter;
  }
}
