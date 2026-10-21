import { getAuthToken } from './auth';
import { API_BASE_URL, TIMEOUTS } from './config';
import { ApiError, AuthError } from './errors';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Defaults to true. `/healthz` is the only unauthenticated call. */
  auth?: boolean;
  headers?: Record<string, string>;
}

interface ResolvedRequest {
  method: NonNullable<ApiRequestOptions['method']>;
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  timeoutMs: number;
  headers?: Record<string, string>;
}

function buildUrl(path: string, query?: QueryParams): string {
  const base = path.startsWith('http')
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const url = new URL(base);

  if (query) {
    for (const [key, raw] of Object.entries(query)) {
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of values) {
        if (value === undefined || value === null) continue;
        url.searchParams.append(key, String(value));
      }
    }
  }

  return url.toString();
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function errorMessage(payload: unknown, status: number, statusText: string): {
  code: string;
  message: string;
} {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const inner = (payload as { error?: unknown }).error;
    if (inner && typeof inner === 'object') {
      const code = (inner as { code?: unknown }).code;
      const message = (inner as { message?: unknown }).message;
      return {
        code: typeof code === 'string' ? code : `http_${status}`,
        message:
          typeof message === 'string' && message.length > 0
            ? message
            : `Request failed with status ${status}.`,
      };
    }
  }
  if (typeof payload === 'string' && payload.trim().length > 0 && payload.length < 400) {
    return { code: `http_${status}`, message: payload.trim() };
  }
  return {
    code: `http_${status}`,
    message: statusText ? `${status} ${statusText}` : `Request failed with status ${status}.`,
  };
}

async function requestOnce<T>(
  path: string,
  request: ResolvedRequest,
  token: string | null,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeoutMs);

  const forwardAbort = () => controller.abort(request.signal?.reason);
  if (request.signal) {
    if (request.signal.aborted) forwardAbort();
    else request.signal.addEventListener('abort', forwardAbort, { once: true });
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...request.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (request.body !== undefined) {
    if (request.body instanceof FormData) {
      body = request.body;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(request.body);
    }
  }

  try {
    const response = await fetch(buildUrl(path, request.query), {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: unknown;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const { code, message } = errorMessage(payload, response.status, response.statusText);
      if (response.status === 401) {
        // The caller decides whether to refresh; this layer only reports.
        throw new ApiError({ status: 401, code, message, body: payload });
      }
      throw new ApiError({
        status: response.status,
        code,
        message,
        retryAfter: parseRetryAfter(response.headers.get('Retry-After')),
        requestId: response.headers.get('X-Request-Id') ?? undefined,
        body: payload,
      });
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) {
      throw new ApiError({
        status: 0,
        code: 'timeout',
        message: `The request exceeded ${request.timeoutMs / 1000}s.`,
      });
    }
    if (request.signal?.aborted) {
      throw new ApiError({ status: 0, code: 'aborted', message: 'Request cancelled.' });
    }
    throw new ApiError({
      status: 0,
      code: 'network',
      message:
        error instanceof Error
          ? `Could not reach the API: ${error.message}`
          : 'Could not reach the API.',
    });
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * The single network boundary.
 *
 * - injects the Bearer token when available
 * - refreshes once on 401, then surfaces `AuthError`
 * - never retries mutations, never caches, never touches localStorage
 * - parses the backend's `{ error: { code, message } }` envelope
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { auth = true, method = 'GET', body, query, signal, timeoutMs, headers } = options;

  const request: ResolvedRequest = {
    method,
    body,
    query,
    signal,
    timeoutMs: timeoutMs ?? TIMEOUTS.default,
    headers,
  };

  try {
    return await requestOnce<T>(path, request, auth ? await getAuthToken() : null);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !auth) throw error;

    const refreshed = await getAuthToken({ forceRefresh: true });
    if (!refreshed) throw new AuthError();

    try {
      return await requestOnce<T>(path, request, refreshed);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) {
        throw new AuthError();
      }
      throw retryError;
    }
  }
}
