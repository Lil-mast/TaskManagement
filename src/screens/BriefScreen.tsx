import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import { Wordmark } from '@/components/Wordmark';
import { ApiError, briefingApi, healthApi, tasksApi } from '@/lib/api';
import type { CreateTaskInput, Priority } from '@/lib/api/schemas/common';
import { useSession } from '@/lib/auth/session';
import { invalidation, queryKeys } from '@/lib/query/keys';

const dateLabel = format(new Date(), 'EEE dd MMM').toUpperCase();

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session expired. Sign in again.';
    if (error.status === 503) return error.message || 'This service is temporarily unavailable.';
    return error.message || `Request failed (${error.status || 'network'}).`;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function BriefScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mode, user, signOut } = useSession();

  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<Priority>('now');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const tasks = useQuery({
    queryKey: queryKeys.tasks.list('open'),
    queryFn: ({ signal }) => tasksApi.list('open', signal),
    retry: 1,
  });

  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => healthApi.get(signal),
    retry: false,
    staleTime: 30_000,
  });

  const openTasks = tasks.data ?? [];
  const hasTasks = tasks.isSuccess && openTasks.length > 0;

  const brief = useQuery({
    queryKey: queryKeys.brief.today,
    queryFn: ({ signal }) => briefingApi.today(signal),
    enabled: hasTasks,
    retry: false,
  });

  const invalidateTaskWrites = () => {
    for (const key of invalidation.afterTaskWrite) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const createTask = useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(input),
    onSuccess: () => {
      setTaskTitle('');
      invalidateTaskWrites();
    },
  });

  const completeTask = useMutation({
    mutationFn: (id: string) => tasksApi.complete(id),
    onSuccess: invalidateTaskWrites,
  });

  const composeBrief = useMutation({
    mutationFn: () => briefingApi.refresh(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.brief.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });

  const counts = useMemo(() => {
    return {
      now: openTasks.filter((task) => task.priority === 'now').length,
      schedule: openTasks.filter((task) => task.priority === 'schedule').length,
      delegate: openTasks.filter((task) => task.priority === 'delegate').length,
      drop: openTasks.filter((task) => task.priority === 'drop').length,
    };
  }, [openTasks]);

  const payload = brief.data?.payload;
  const priorityCount = payload?.priorities.length ?? 0;
  const drill = payload?.leetcode.pattern ?? 'None due';
  const firstName = (user?.name ?? user?.email ?? 'operator').split(/[ @]/)[0];
  const initial = (user?.name ?? user?.email ?? 'M').slice(0, 1).toUpperCase();

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title) return;
    createTask.mutate({ title, priority: taskPriority, source: 'manual' });
  }

  async function handleSignOut() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
      queryClient.clear();
      navigate('/', { replace: true });
    } catch (caught) {
      setSignOutError(describeError(caught));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="brief-page">
      <header className="brief-topbar">
        <Wordmark to="/brief" size="sm" />
        <div className="brief-topbar__center">
          <span className="mono-label">THE DAILY BRIEF</span>
          <span className="mono-label mono-label--muted">{dateLabel}</span>
        </div>
        <div className="brief-topbar__account">
          <span className="brief-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="brief-topbar__name">{user?.name ?? user?.email}</span>
          <button
            className="brief-topbar__signout"
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <main className="brief-main">
        <section className="brief-hero">
          <div>
            <p className="eyebrow">
              <span className="eyebrow__pip" aria-hidden="true" />
              {dateLabel} / {mode === 'dev' ? 'LOCAL SESSION' : 'FIREBASE SESSION'}
            </p>
            <h1>
              {greeting()},<br />
              <span>{firstName}.</span>
            </h1>
            <p className="brief-hero__lede">
              Read the day. Keep what matters. Nothing moves until you decide.
            </p>
          </div>
          <div className="brief-hero__action">
            <button
              className="btn btn--ink"
              type="button"
              onClick={() => composeBrief.mutate()}
              disabled={!hasTasks || composeBrief.isPending}
            >
              {composeBrief.isPending
                ? 'Composing…'
                : payload
                  ? 'Compose again'
                  : 'Compose brief'}
            </button>
            <span className="brief-hero__hint">
              {hasTasks
                ? 'Proposals, not writes.'
                : 'Add at least one task to compose a brief.'}
            </span>
          </div>
        </section>

        {composeBrief.isError ? (
          <p className="inline-error" role="alert">
            {describeError(composeBrief.error)}
          </p>
        ) : null}

        {signOutError ? (
          <p className="inline-error" role="alert">
            {signOutError}
          </p>
        ) : null}

        <section className="brief-metrics" aria-label="Today at a glance">
          <article className="metric">
            <span className="metric__label">PRIORITIES</span>
            <span className="metric__value">{payload ? priorityCount : '—'}</span>
            <span className="metric__note">
              {payload ? 'Named in today’s brief' : 'Waiting for a brief'}
            </span>
          </article>
          <article className="metric">
            <span className="metric__label">OPEN LEDGER</span>
            <span className="metric__value">{tasks.isPending ? '—' : openTasks.length}</span>
            <span className="metric__note">
              NOW {counts.now} · SCHEDULE {counts.schedule} · DELEGATE {counts.delegate} · DROP{' '}
              {counts.drop}
            </span>
          </article>
          <article className="metric metric--ink">
            <span className="metric__label">DRILL</span>
            <span className="metric__value metric__value--small">{drill}</span>
            <span className="metric__note">
              {payload?.leetcode.note ?? 'No pattern due today'}
            </span>
          </article>
        </section>

        <div className="brief-grid">
          <section className="panel brief-panel" aria-label="Today's brief">
            <header className="panel__head">
              <span>THE BRIEF</span>
              <span className="mono-label mono-label--muted">
                {brief.data
                  ? `COMPOSED ${format(parseISO(brief.data.created_at), 'HH:mm')}`
                  : 'PROPOSED, NOT WRITTEN'}
              </span>
            </header>

            {tasks.isPending || (hasTasks && brief.isPending) ? (
              <div className="brief-skeleton" aria-label="Composing the brief">
                <span />
                <span />
                <span />
                <span />
              </div>
            ) : tasks.isError ? (
              <div className="panel__empty">
                <h2>The ledger couldn’t be read.</h2>
                <p>{describeError(tasks.error)}</p>
                <button className="btn btn--ghost" type="button" onClick={() => void tasks.refetch()}>
                  Try again
                </button>
              </div>
            ) : !hasTasks ? (
              <div className="panel__empty">
                <h2>The ledger is empty.</h2>
                <p>
                  Add the first task in the ledger, then compose a brief. MrT needs at least one
                  real item to ground the day.
                </p>
              </div>
            ) : brief.isError ? (
              <div className="panel__empty">
                <h2>The brief couldn’t be composed.</h2>
                <p>{describeError(brief.error)}</p>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => void brief.refetch()}
                >
                  Try again
                </button>
              </div>
            ) : payload ? (
              <article className="brief-copy">
                <p className="brief-copy__headline">{payload.headline}</p>

                {payload.priorities.length > 0 ? (
                  <ol className="priority-list">
                    {payload.priorities.map((priority, index) => (
                      <li key={`${priority.task_id}-${index}`}>
                        <span className="priority-list__num">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <h3>{priority.title}</h3>
                          <p>{priority.why}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="brief-copy__empty">No priorities named in this brief.</p>
                )}

                {payload.watchlist.length > 0 ? (
                  <div className="brief-watch">
                    <p className="mono-label">WATCHLIST</p>
                    <ul>
                      {payload.watchlist.map((item) => (
                        <li key={`${item.permalink}-${item.title}`}>
                          <a href={item.permalink} target="_blank" rel="noreferrer">
                            {item.title}
                          </a>
                          <span>{item.verdict}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {payload.principles_used.length > 0 ? (
                  <div className="brief-principles">
                    <p className="mono-label">PRINCIPLES USED</p>
                    <ul>
                      {payload.principles_used.map((principle) => (
                        <li className="tag" key={principle}>
                          {principle}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="brief-copy__rule">
                  <span className="status-pip" aria-hidden="true" />
                  MrT proposes. You decide.
                </p>
              </article>
            ) : null}
          </section>

          <aside className="brief-side">
            <section className="panel ledger" aria-label="Open ledger">
              <header className="panel__head">
                <span>THE LEDGER</span>
                <span className="mono-label mono-label--muted">
                  {tasks.isPending ? 'READING' : `${openTasks.length} OPEN`}
                </span>
              </header>

              <form className="task-form" onSubmit={addTask}>
                <label className="field field--compact">
                  <span className="visually-hidden">Task title</span>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    placeholder="Add a task…"
                    disabled={createTask.isPending}
                  />
                </label>
                <div className="task-form__row">
                  <label className="field field--compact">
                    <span className="visually-hidden">Priority</span>
                    <select
                      value={taskPriority}
                      onChange={(event) => setTaskPriority(event.target.value as Priority)}
                      disabled={createTask.isPending}
                    >
                      <option value="now">Now</option>
                      <option value="schedule">Schedule</option>
                      <option value="delegate">Delegate</option>
                      <option value="drop">Drop</option>
                    </select>
                  </label>
                  <button
                    className="btn btn--ink btn--small"
                    type="submit"
                    disabled={!taskTitle.trim() || createTask.isPending}
                  >
                    Add
                  </button>
                </div>
                {createTask.isError ? (
                  <p className="inline-error" role="alert">
                    {describeError(createTask.error)}
                  </p>
                ) : null}
              </form>

              {tasks.isPending ? (
                <div className="ledger__skeleton">
                  <span />
                  <span />
                  <span />
                </div>
              ) : openTasks.length > 0 ? (
                <ul className="task-list">
                  {openTasks.slice(0, 8).map((task) => (
                    <li key={task.id} className="task">
                      <span className={`tag tag--${task.priority}`}>{task.priority}</span>
                      <div className="task__body">
                        <span className="task__title">{task.title}</span>
                        <span className="task__meta">
                          {task.due_date ? `DUE ${format(parseISO(task.due_date), 'dd MMM')}` : 'NO DATE'}
                          {task.tags.length > 0 ? ` · ${task.tags.join(' / ')}` : ''}
                        </span>
                      </div>
                      <button
                        className="task__done"
                        type="button"
                        onClick={() => completeTask.mutate(task.id)}
                        disabled={completeTask.isPending}
                      >
                        Done
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ledger__empty">Nothing in the ledger. Add the first task above.</p>
              )}

              {completeTask.isError ? (
                <p className="inline-error" role="alert">
                  {describeError(completeTask.error)}
                </p>
              ) : null}
            </section>

            <section className="panel panel--ink brief-rule" aria-label="The product rule">
              <p className="mono-label">THE RULE</p>
              <p className="brief-rule__statement">
                MrT proposes.
                <br />
                You decide.
              </p>
              <p className="brief-rule__copy">
                Capture and triage return proposals only. Accepting is a separate, explicit write.
              </p>
            </section>
          </aside>
        </div>
      </main>

      <footer className="brief-statusbar">
        <span className="brief-statusbar__item">
          <span
            className={`status-pip ${health.isSuccess ? '' : health.isPending ? 'status-pip--idle' : 'status-pip--bad'}`}
            aria-hidden="true"
          />
          {health.isPending ? 'SYNCING' : health.isSuccess ? 'SYNCED' : 'OFFLINE'}
        </span>
        <span>{mode === 'dev' ? 'LOCAL SESSION' : 'FIREBASE SESSION'}</span>
        <span>{user?.email}</span>
      </footer>
    </div>
  );
}
