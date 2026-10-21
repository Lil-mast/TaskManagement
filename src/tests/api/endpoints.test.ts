import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { captureApi, tasksApi } from '@/lib/api';
import { setAuthTokenProvider } from '@/lib/api/auth';
import { taskFixture } from '../fixtures';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  setAuthTokenProvider(async () => 'fixture-token');
});

describe('tasksApi', () => {
  it('reads the ledger with the status filter', async () => {
    server.use(
      http.get('http://localhost:8000/api/tasks', ({ request }) => {
        expect(new URL(request.url).searchParams.get('status')).toBe('archived');
        return HttpResponse.json([taskFixture]);
      }),
    );

    const tasks = await tasksApi.list('archived');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.priority).toBe('now');
  });

  it('sends explicit nulls when clearing fields', async () => {
    server.use(
      http.patch('http://localhost:8000/api/tasks/11111111-1111-4111-8111-111111111111', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.due_date).toBeNull();
        expect(body.description).toBeNull();
        expect(body.tags).toEqual([]);
        return HttpResponse.json(taskFixture);
      }),
    );

    await tasksApi.update(taskFixture.id, {
      due_date: null,
      description: null,
      tags: [],
    });
  });

  it('purges with the explicit query flag', async () => {
    server.use(
      http.delete('http://localhost:8000/api/tasks/11111111-1111-4111-8111-111111111111', ({ request }) => {
        expect(new URL(request.url).searchParams.get('purge')).toBe('true');
        return HttpResponse.json({ purged: 1 });
      }),
    );

    await expect(tasksApi.purge(taskFixture.id)).resolves.toBe(1);
  });
});

describe('captureApi', () => {
  it('defaults to proposals-only and never persists silently', async () => {
    server.use(
      http.post('http://localhost:8000/api/capture', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toEqual({ text: 'call the dentist tomorrow', persist: false });
        return HttpResponse.json({
          tasks: [
            {
              title: 'Call the dentist',
              priority: 'now',
              due_date: '2026-10-22',
              tags: ['errand'],
              confidence: 'high',
            },
          ],
        });
      }),
    );

    const response = await captureApi.create({ text: 'call the dentist tomorrow' });
    expect(response.tasks[0]?.title).toBe('Call the dentist');
    expect(response.saved_to_db).toBeUndefined();
  });

  it('allows an explicit persist opt-in for internal tools', async () => {
    server.use(
      http.post('http://localhost:8000/api/capture', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.persist).toBe(true);
        return HttpResponse.json({ tasks: [], saved_to_db: 0 });
      }),
    );

    await captureApi.create({ text: 'note', persist: true });
  });
});
