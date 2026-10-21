import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { AUTH_MODE } from '@/lib/api/config';
import { ApiError, ContractError } from '@/lib/api/errors';
import { healthApi, tasksApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.status || 'NET'} ${error.code} — ${error.message}`;
  }
  if (error instanceof ContractError) {
    return `Contract error at ${error.path}`;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

export function StatusScreen() {
  const queryClient = useQueryClient();

  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => healthApi.get(signal),
  });

  const tasks = useQuery({
    queryKey: queryKeys.tasks.list('open'),
    queryFn: ({ signal }) => tasksApi.list('open', signal),
    retry: false,
  });

  const nowCount = tasks.data?.filter((task) => task.priority === 'now').length ?? 0;
  const scheduleCount = tasks.data?.filter((task) => task.priority === 'schedule').length ?? 0;
  const delegateCount = tasks.data?.filter((task) => task.priority === 'delegate').length ?? 0;
  const dropCount = tasks.data?.filter((task) => task.priority === 'drop').length ?? 0;

  return (
    <main className="smoke">
      <header>
        <Link className="smoke__back" to="/">
          ← Landing
        </Link>
        <p className="smoke__eyebrow">MrT // Daily Intelligence · System status</p>
        <h1 className="smoke__title">The wires behind the brief.</h1>
        <p className="smoke__lede">
          A diagnostics page for the API boundary, auth mode, and priority ledger. This is not
          part of the product flow.
        </p>
      </header>

      <section className="smoke__grid" aria-label="API status">
        <article className="smoke__card">
          <span className="smoke__label">Backend</span>
          <span className="smoke__metric smoke__status">
            <span
              className={`smoke__pip ${health.isSuccess ? '' : 'smoke__pip--bad'}`}
              aria-hidden="true"
            />
            {health.isPending ? '…' : health.isSuccess ? 'OK' : 'DOWN'}
          </span>
          <p className="smoke__mono">
            {health.data
              ? `v${health.data.version} · db ${health.data.database} · llm ${health.data.anthropic}`
              : health.isError
                ? describeError(health.error)
                : 'contacting /healthz'}
          </p>
        </article>

        <article className="smoke__card">
          <span className="smoke__label">Auth mode</span>
          <span className="smoke__metric">{AUTH_MODE === 'dev' ? 'DEV' : 'FIREBASE'}</span>
          <p className="smoke__mono">
            {AUTH_MODE === 'dev'
              ? 'Bearer dev — only valid when the backend has no identity provider.'
              : 'Firebase ID token attached to every /api call.'}
          </p>
        </article>

        <article className="smoke__card smoke__card--ink">
          <span className="smoke__label">Open ledger</span>
          <span className="smoke__metric">
            {tasks.isPending ? '—' : tasks.isSuccess ? tasks.data.length : 'ERR'}
          </span>
          <p className="smoke__mono">
            {tasks.isSuccess
              ? `NOW ${nowCount} · SCHEDULE ${scheduleCount} · DELEGATE ${delegateCount} · DROP ${dropCount}`
              : tasks.isError
                ? describeError(tasks.error)
                : 'reading /api/tasks?status=open'}
          </p>
        </article>
      </section>

      <section className="smoke__card" aria-label="Contract notes">
        <span className="smoke__label">Verified contract</span>
        <p className="smoke__mono">
          38 operations · tasks · capture · briefing · leetcode · email · calendar · review ·
          profile · onboarding · integrations · knowledge
        </p>
        <p className="smoke__mono">
          Proposals are never persisted by the client. Accepting is a separate, explicit tasks
          write.
        </p>
        <div className="smoke__actions">
          <button
            type="button"
            className="smoke__button"
            onClick={() =>
              void Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.health }),
                queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
              ])
            }
          >
            Refresh probes
          </button>
          <Link className="smoke__button smoke__button--ghost" to="/">
            Back to landing
          </Link>
        </div>
      </section>
    </main>
  );
}
