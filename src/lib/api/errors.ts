export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  retryAfter?: number;
  requestId?: string;
  body?: unknown;
}

/** Every non-2xx response, network failure, timeout, and abort lands here. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;
  readonly requestId?: string;
  readonly body?: unknown;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.retryAfter = init.retryAfter;
    this.requestId = init.requestId;
    this.body = init.body;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isUnavailable(): boolean {
    return this.status === 503;
  }
}

/** A 401 that survived one forced token refresh. The app should sign in again. */
export class AuthError extends ApiError {
  constructor(message = 'Your session expired. Sign in again.') {
    super({ status: 401, code: 'auth_expired', message });
    this.name = 'AuthError';
  }
}

/** The server answered, but the payload no longer matches the documented shape. */
export class ContractError extends Error {
  readonly path: string;
  readonly issues: unknown;

  constructor(path: string, issues: unknown) {
    super(`Response contract mismatch at ${path}`);
    this.name = 'ContractError';
    this.path = path;
    this.issues = issues;
  }
}
