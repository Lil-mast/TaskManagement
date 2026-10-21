import { HttpResponse, delay, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { apiFetch } from '@/lib/api/client';
import { setAuthTokenProvider } from '@/lib/api/auth';
import { ApiError, AuthError } from '@/lib/api/errors';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  setAuthTokenProvider(async () => 'fixture-token');
});

describe('apiFetch', () => {
  it('attaches the bearer token to authenticated calls', async () => {
    server.use(
      http.get('http://localhost:8000/api/probe', ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer fixture-token');
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(apiFetch('/api/probe')).resolves.toEqual({ ok: true });
  });

  it('omits the bearer token when auth is disabled', async () => {
    let tokenCalls = 0;
    setAuthTokenProvider(async () => {
      tokenCalls += 1;
      return 'fixture-token';
    });

    server.use(
      http.get('http://localhost:8000/healthz', ({ request }) => {
        expect(request.headers.get('authorization')).toBeNull();
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(apiFetch('/healthz', { auth: false })).resolves.toEqual({ ok: true });
    expect(tokenCalls).toBe(0);
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    let tokenCalls = 0;
    setAuthTokenProvider(async ({ forceRefresh } = {}) => {
      tokenCalls += 1;
      return forceRefresh ? 'refreshed-token' : 'stale-token';
    });

    server.use(
      http.get('http://localhost:8000/api/protected', ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer refreshed-token') {
          return HttpResponse.json({ ok: true });
        }
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(apiFetch('/api/protected')).resolves.toEqual({ ok: true });
    expect(tokenCalls).toBe(2);
  });

  it('surfaces AuthError when the refresh does not help', async () => {
    setAuthTokenProvider(async ({ forceRefresh } = {}) => (forceRefresh ? 'still-bad' : 'bad'));

    server.use(
      http.get('http://localhost:8000/api/protected', () => new HttpResponse(null, { status: 401 })),
    );

    await expect(apiFetch('/api/protected')).rejects.toBeInstanceOf(AuthError);
  });

  it('parses the backend error envelope and Retry-After', async () => {
    server.use(
      http.get('http://localhost:8000/api/limited', () =>
        HttpResponse.json(
          { error: { code: 'rate_limited', message: 'slow down' } },
          { status: 429, headers: { 'Retry-After': '12' } },
        ),
      ),
    );

    const error = await apiFetch('/api/limited').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(429);
    expect(apiError.code).toBe('rate_limited');
    expect(apiError.retryAfter).toBe(12);
  });

  it('maps a 503 unavailable envelope without retrying', async () => {
    let calls = 0;
    server.use(
      http.get('http://localhost:8000/api/unavailable', () => {
        calls += 1;
        return HttpResponse.json(
          { error: { code: 'unavailable', message: 'database not configured' } },
          { status: 503 },
        );
      }),
    );

    const error = await apiFetch('/api/unavailable').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isUnavailable).toBe(true);
    expect(calls).toBe(1);
  });

  it('turns a timeout into a typed ApiError', async () => {
    server.use(
      http.get('http://localhost:8000/api/slow', async () => {
        await delay(100);
        return HttpResponse.json({ ok: true });
      }),
    );

    const error = await apiFetch('/api/slow', { timeoutMs: 10 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('timeout');
  });

  it('serialises query values and skips null/undefined', async () => {
    server.use(
      http.get('http://localhost:8000/api/query', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('status')).toBe('open');
        expect(url.searchParams.has('missing')).toBe(false);
        expect(url.searchParams.getAll('tag')).toEqual(['work', 'writing']);
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiFetch('/api/query', {
      query: { status: 'open', missing: undefined, tag: ['work', 'writing'] },
    });
  });
});
