import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { TaskComposer } from '@/components/TaskComposer';
import { TaskDrawer } from '@/components/TaskDrawer';
import { CaptureIcon, SearchIcon } from '@/components/icons';
import { tasksApi } from '@/lib/api';
import type { Priority, Task, TaskStatus } from '@/lib/api/schemas/common';
import { invalidation, queryKeys } from '@/lib/query/keys';
import {
  describeApiError,
  dueLabel,
  isOverdue,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  sourceClass,
  sourceLabel,
  taskConfidence,
} from '@/lib/task-ui';

const EMPTY_LANE: Record<Priority, string> = {
  now: 'Nothing in NOW. Protect that.',
  schedule: 'Nothing scheduled. Leave room.',
  delegate: 'Nothing to hand off. Good.',
  drop: 'Nothing to drop. Suspicious.',
};

function sortTasks(tasks: Task[], sort: 'due' | 'created'): Task[] {
  return [...tasks].sort((a, b) => {
    if (sort === 'created') {
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    }
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}

function priorityFromParam(value: string | null): Priority | 'all' {
  return value === 'now' || value === 'schedule' || value === 'delegate' || value === 'drop'
    ? value
    : 'all';
}

export function TasksScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { id: drawerId } = useParams<{ id: string }>();
  const searchRef = useRef<HTMLInputElement>(null);

  const status: TaskStatus = params.get('status') === 'done' ? 'done' : 'open';
  const view = params.get('view') === 'list' ? 'list' : 'board';
  const priority = priorityFromParam(params.get('priority'));
  const source = params.get('source') ?? 'all';
  const tag = params.get('tag') ?? 'all';
  const sort = params.get('sort') === 'created' ? 'created' : 'due';
  const query = params.get('q') ?? '';

  const [composerOpen, setComposerOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const lists = useQueries({
    queries: (['open', 'done'] as TaskStatus[]).map((nextStatus) => ({
      queryKey: queryKeys.tasks.list(nextStatus),
      queryFn: ({ signal }: { signal: AbortSignal }) => tasksApi.list(nextStatus, signal),
      staleTime: 30_000,
    })),
  });

  const openQuery = lists[0];
  const doneQuery = lists[1];
  const currentQuery = status === 'done' ? doneQuery : openQuery;
  const currentTasks = currentQuery.data ?? [];
  const loading = currentQuery.isPending;
  const error = currentQuery.error;

  useEffect(() => {
    document.title = 'Tasks · MrT';
    if (drawerId) document.title = 'Task detail · MrT';
  }, [drawerId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function setParam(key: string, value: string | null) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (!value || value === 'all') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  function invalidateWrites() {
    for (const key of invalidation.afterTaskWrite) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const completeTask = useMutation({
    mutationFn: (taskId: string) => tasksApi.complete(taskId),
    onMutate: async (taskId) => {
      setActionError(null);
      const key = queryKeys.tasks.list('open');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData<Task[]>(key, (tasks = []) =>
        tasks.filter((task) => task.id !== taskId),
      );
      return { previous };
    },
    onError: (caught, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.tasks.list('open'), context.previous);
      }
      setActionError(describeApiError(caught));
    },
    onSettled: invalidateWrites,
  });

  const reopenTask = useMutation({
    mutationFn: (taskId: string) => tasksApi.reopen(taskId),
    onMutate: async (taskId) => {
      setActionError(null);
      const key = queryKeys.tasks.list('done');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData<Task[]>(key, (tasks = []) =>
        tasks.filter((task) => task.id !== taskId),
      );
      return { previous };
    },
    onError: (caught, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.tasks.list('done'), context.previous);
      }
      setActionError(describeApiError(caught));
    },
    onSettled: invalidateWrites,
  });

  const archiveTask = useMutation({
    mutationFn: (taskId: string) => tasksApi.archive(taskId),
    onMutate: async (taskId) => {
      setActionError(null);
      const openKey = queryKeys.tasks.list('open');
      const doneKey = queryKeys.tasks.list('done');
      await Promise.all([
        queryClient.cancelQueries({ queryKey: openKey }),
        queryClient.cancelQueries({ queryKey: doneKey }),
      ]);
      const previous = {
        open: queryClient.getQueryData<Task[]>(openKey),
        done: queryClient.getQueryData<Task[]>(doneKey),
      };
      queryClient.setQueryData<Task[]>(openKey, (tasks = []) =>
        tasks.filter((task) => task.id !== taskId),
      );
      queryClient.setQueryData<Task[]>(doneKey, (tasks = []) =>
        tasks.filter((task) => task.id !== taskId),
      );
      return previous;
    },
    onError: (caught, _taskId, context) => {
      if (context) {
        queryClient.setQueryData(queryKeys.tasks.list('open'), context.open);
        queryClient.setQueryData(queryKeys.tasks.list('done'), context.done);
      }
      setActionError(describeApiError(caught));
    },
    onSettled: invalidateWrites,
  });

  const moveTask = useMutation({
    mutationFn: ({ taskId, nextPriority }: { taskId: string; nextPriority: Priority }) =>
      tasksApi.update(taskId, { priority: nextPriority }),
    onMutate: () => setActionError(null),
    onError: (caught) => setActionError(describeApiError(caught)),
    onSettled: invalidateWrites,
  });

  const sourceOptions = useMemo(
    () => [...new Set(currentTasks.map((task) => task.source))].sort(),
    [currentTasks],
  );
  const tagOptions = useMemo(
    () => [...new Set(currentTasks.flatMap((task) => task.tags))].sort(),
    [currentTasks],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = currentTasks.filter((task) => {
      if (priority !== 'all' && task.priority !== priority) return false;
      if (source !== 'all' && task.source !== source) return false;
      if (tag !== 'all' && !task.tags.includes(tag)) return false;
      if (needle) {
        const haystack = [task.title, task.description ?? '', ...task.tags]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    return sortTasks(matches, sort);
  }, [currentTasks, priority, query, sort, source, tag]);

  const doneGroups = useMemo(() => {
    const groups = new Map<string, Task[]>();
    const byCompletion = [...filtered].sort(
      (a, b) =>
        Date.parse(b.completed_at ?? b.created_at) -
        Date.parse(a.completed_at ?? a.created_at),
    );
    for (const task of byCompletion) {
      const key = task.completed_at
        ? format(parseISO(task.completed_at), 'EEE dd MMM yyyy').toUpperCase()
        : 'COMPLETED';
      const group = groups.get(key) ?? [];
      group.push(task);
      groups.set(key, group);
    }
    return [...groups.entries()];
  }, [filtered]);

  const capturePath = `/capture?return=${encodeURIComponent(`/tasks${location.search}`)}`;

  function openTask(taskId: string) {
    navigate(`/tasks/${taskId}${location.search}`);
  }

  function clearFilters() {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('priority');
        next.delete('source');
        next.delete('tag');
        next.delete('q');
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div className="tasks-page">
      <header className="tasks-hero">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__pip" aria-hidden="true" />
            PRIORITY LEDGER / {currentTasks.length} {status === 'done' ? 'DONE' : 'OPEN'}
          </p>
          <h1>What actually moves.</h1>
          <p className="tasks-hero__lede">
            Now, schedule, delegate, drop. The matrix is the product; the list is only a view.
          </p>
        </div>
        <div className="tasks-hero__actions">
          <button className="btn btn--ink" type="button" onClick={() => setComposerOpen(true)}>
            New task
          </button>
          <Link className="btn btn--ghost" to={capturePath}>
            <CaptureIcon />
            Capture
          </Link>
        </div>
      </header>

      <div className="tasks-toolbar">
        <div className="tasks-tabs" role="tablist" aria-label="Task status">
          <button
            className={`tasks-tab ${status === 'open' ? 'tasks-tab--active' : ''}`}
            type="button"
            role="tab"
            aria-selected={status === 'open'}
            onClick={() => setParam('status', 'open')}
          >
            Open <span>{openQuery.data?.length ?? '—'}</span>
          </button>
          <button
            className={`tasks-tab ${status === 'done' ? 'tasks-tab--active' : ''}`}
            type="button"
            role="tab"
            aria-selected={status === 'done'}
            onClick={() => setParam('status', 'done')}
          >
            Done <span>{doneQuery.data?.length ?? '—'}</span>
          </button>
        </div>

        <label className="tasks-search">
          <SearchIcon />
          <span className="visually-hidden">Search tasks</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setParam('q', event.target.value)}
            placeholder="Search tasks…"
          />
          <kbd>/</kbd>
        </label>

        <label className="tasks-select">
          <span className="visually-hidden">Filter by priority</span>
          <select
            value={priority}
            onChange={(event) => setParam('priority', event.target.value)}
          >
            <option value="all">All priorities</option>
            {PRIORITY_ORDER.map((item) => (
              <option key={item} value={item}>
                {PRIORITY_LABEL[item]}
              </option>
            ))}
          </select>
        </label>

        <label className="tasks-select">
          <span className="visually-hidden">Filter by source</span>
          <select value={source} onChange={(event) => setParam('source', event.target.value)}>
            <option value="all">All sources</option>
            {sourceOptions.map((item) => (
              <option key={item} value={item}>
                {sourceLabel(item)}
              </option>
            ))}
          </select>
        </label>

        <label className="tasks-select">
          <span className="visually-hidden">Filter by tag</span>
          <select value={tag} onChange={(event) => setParam('tag', event.target.value)}>
            <option value="all">All tags</option>
            {tagOptions.map((item) => (
              <option key={item} value={item}>
                #{item}
              </option>
            ))}
          </select>
        </label>

        <label className="tasks-select">
          <span className="visually-hidden">Sort tasks</span>
          <select value={sort} onChange={(event) => setParam('sort', event.target.value)}>
            <option value="due">Sort: due</option>
            <option value="created">Sort: created</option>
          </select>
        </label>

        {status === 'open' ? (
          <div className="view-toggle" aria-label="View">
            <button
              className={view === 'board' ? 'view-toggle__item view-toggle__item--active' : 'view-toggle__item'}
              type="button"
              onClick={() => setParam('view', 'board')}
            >
              Board
            </button>
            <button
              className={view === 'list' ? 'view-toggle__item view-toggle__item--active' : 'view-toggle__item'}
              type="button"
              onClick={() => setParam('view', 'list')}
            >
              List
            </button>
          </div>
        ) : null}
      </div>

      {actionError ? (
        <div className="tasks-banner" role="alert">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="tasks-loading" aria-label="Loading tasks">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="tasks-loading__lane">
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="tasks-empty">
          <p className="mono-label">LEDGER OFFLINE</p>
          <h2>The ledger couldn’t be read.</h2>
          <p>{describeApiError(error)}</p>
          <button className="btn btn--ghost" type="button" onClick={() => void currentQuery.refetch()}>
            Try again
          </button>
        </div>
      ) : currentTasks.length === 0 ? (
        <div className="tasks-empty">
          <p className="mono-label">{status === 'done' ? 'NO COMPLETIONS' : 'EMPTY LEDGER'}</p>
          <h2>{status === 'done' ? 'Nothing completed yet.' : 'The ledger is empty.'}</h2>
          <p>
            {status === 'done'
              ? 'Finish a task and it will land here with its completion time.'
              : 'Add the first task, or capture a sentence and review the proposals.'}
          </p>
          <div className="tasks-empty__actions">
            {status === 'open' ? (
              <button className="btn btn--ink" type="button" onClick={() => setComposerOpen(true)}>
                New task
              </button>
            ) : null}
            <Link className="btn btn--ghost" to={capturePath}>
              Capture
            </Link>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="tasks-empty">
          <p className="mono-label">NO MATCHES</p>
          <h2>Nothing matches those filters.</h2>
          <p>The ledger is intact. Clear the filters to see it again.</p>
          <button className="btn btn--ghost" type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : status === 'done' ? (
        <div className="done-groups">
          {doneGroups.map(([label, tasks]) => (
            <section className="done-group" key={label}>
              <header className="done-group__head">
                <span>{label}</span>
                <span>{tasks.length} DONE</span>
              </header>
              <ul className="task-rows">
                {tasks.map((task) => (
                  <li key={task.id} className="task-row task-row--done">
                    <button
                      className="task-check task-check--checked"
                      type="button"
                      aria-label={`Reopen ${task.title}`}
                      onClick={() => reopenTask.mutate(task.id)}
                    />
                    <button className="task-row__body" type="button" onClick={() => openTask(task.id)}>
                      <span className="task-row__title">{task.title}</span>
                      <span className="task-row__meta">
                        {PRIORITY_LABEL[task.priority]} · {sourceLabel(task.source)}
                        {task.completed_at
                          ? ` · ${format(parseISO(task.completed_at), 'HH:mm')}`
                          : ''}
                      </span>
                    </button>
                    <span className={`tag tag--${task.priority}`}>{task.priority}</span>
                    <button
                      className="task-row__secondary"
                      type="button"
                      onClick={() => archiveTask.mutate(task.id)}
                    >
                      Archive
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : view === 'board' ? (
        <div className="task-board">
          {PRIORITY_ORDER.map((lane) => (
            <TaskLane
              key={lane}
              priority={lane}
              tasks={filtered.filter((task) => task.priority === lane)}
              onOpen={openTask}
              onComplete={(taskId) => completeTask.mutate(taskId)}
              onArchive={(taskId) => archiveTask.mutate(taskId)}
              onMove={(taskId, nextPriority) => moveTask.mutate({ taskId, nextPriority })}
            />
          ))}
        </div>
      ) : (
        <ul className="task-rows task-rows--list">
          {filtered.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onOpen={() => openTask(task.id)}
              onComplete={() => completeTask.mutate(task.id)}
              onArchive={() => archiveTask.mutate(task.id)}
              onMove={(nextPriority) => moveTask.mutate({ taskId: task.id, nextPriority })}
            />
          ))}
        </ul>
      )}

      <TaskComposer open={composerOpen} onClose={() => setComposerOpen(false)} />

      {drawerId ? (
        <TaskDrawer taskId={drawerId} onClose={() => navigate(`/tasks${location.search}`)} />
      ) : null}
    </div>
  );
}

interface TaskLaneProps {
  priority: Priority;
  tasks: Task[];
  onOpen: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onArchive: (taskId: string) => void;
  onMove: (taskId: string, priority: Priority) => void;
}

function TaskLane({ priority, tasks, onOpen, onComplete, onArchive, onMove }: TaskLaneProps) {
  const [open, setOpen] = useState(true);
  return (
    <section className={`lane ${open ? 'lane--open' : ''}`}>
      <header className="lane__head">
        <button
          className="lane__toggle"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="lane__name">{PRIORITY_LABEL[priority]}</span>
          <span className="lane__count">{String(tasks.length).padStart(2, '0')}</span>
          <span className="lane__sign" aria-hidden="true">
            {open ? '−' : '+'}
          </span>
        </button>
      </header>
      {open ? (
        <div className="lane__body">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpen={() => onOpen(task.id)}
                onComplete={() => onComplete(task.id)}
                onArchive={() => onArchive(task.id)}
                onMove={(nextPriority) => onMove(task.id, nextPriority)}
              />
            ))
          ) : (
            <p className="lane__empty">{EMPTY_LANE[priority]}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

interface TaskCardProps {
  task: Task;
  onOpen: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onMove: (priority: Priority) => void;
}

function TaskCard({ task, onOpen, onComplete, onArchive, onMove }: TaskCardProps) {
  const confidence = taskConfidence(task);
  const overdue = isOverdue(task.due_date);

  return (
    <article className="task-card">
      <button
        className="task-check"
        type="button"
        aria-label={`Complete ${task.title}`}
        onClick={onComplete}
      />
      <button className="task-card__body" type="button" onClick={onOpen}>
        <span className="task-card__title">{task.title}</span>
        <span className={`task-card__meta ${overdue ? 'task-card__meta--overdue' : ''}`}>
          {dueLabel(task.due_date)}
          {task.tags.length > 0 ? ` · ${task.tags.map((item) => `#${item}`).join(' ')}` : ''}
        </span>
        <span className="task-card__provenance">
          <span className={sourceClass(task.source)} aria-hidden="true" />
          {sourceLabel(task.source)}
          {confidence ? ` · ${confidence}` : ''}
        </span>
      </button>
      <TaskMenu
        task={task}
        onOpen={onOpen}
        onComplete={onComplete}
        onArchive={onArchive}
        onMove={onMove}
      />
    </article>
  );
}

interface TaskRowProps {
  task: Task;
  onOpen: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onMove: (priority: Priority) => void;
}

function TaskRow({ task, onOpen, onComplete, onArchive, onMove }: TaskRowProps) {
  const confidence = taskConfidence(task);
  return (
    <li className="task-row">
      <button
        className="task-check"
        type="button"
        aria-label={`Complete ${task.title}`}
        onClick={onComplete}
      />
      <button className="task-row__body" type="button" onClick={onOpen}>
        <span className="task-row__title">{task.title}</span>
        <span className="task-row__meta">
          {dueLabel(task.due_date)}
          {task.tags.length > 0 ? ` · ${task.tags.map((item) => `#${item}`).join(' ')}` : ''}
          {confidence ? ` · ${confidence}` : ''}
        </span>
      </button>
      <span className={`tag tag--${task.priority}`}>{task.priority}</span>
      <span className="task-row__source">
        <span className={sourceClass(task.source)} aria-hidden="true" />
        {sourceLabel(task.source)}
      </span>
      <TaskMenu
        task={task}
        onOpen={onOpen}
        onComplete={onComplete}
        onArchive={onArchive}
        onMove={onMove}
      />
    </li>
  );
}

interface TaskMenuProps {
  task: Task;
  onOpen: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onMove: (priority: Priority) => void;
}

function TaskMenu({ task, onOpen, onComplete, onArchive, onMove }: TaskMenuProps) {
  return (
    <details className="task-menu">
      <summary aria-label={`Actions for ${task.title}`}>···</summary>
      <div className="task-menu__panel">
        <button type="button" onClick={onOpen}>
          Open
        </button>
        <span className="task-menu__label">Move to</span>
        {PRIORITY_ORDER.map((priority) => (
          <button
            key={priority}
            type="button"
            disabled={priority === task.priority}
            onClick={() => onMove(priority)}
          >
            {PRIORITY_LABEL[priority]}
          </button>
        ))}
        <span className="task-menu__rule" />
        <button type="button" onClick={onComplete}>
          Complete
        </button>
        <button type="button" className="task-menu__danger" onClick={onArchive}>
          Archive
        </button>
      </div>
    </details>
  );
}


