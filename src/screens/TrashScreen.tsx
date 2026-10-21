import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TaskDrawer } from '@/components/TaskDrawer';
import { tasksApi } from '@/lib/api';
import type { Task } from '@/lib/api/schemas/common';
import { invalidation, queryKeys } from '@/lib/query/keys';
import { createdLabel, describeApiError, sourceLabel } from '@/lib/task-ui';

export function TrashScreen() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Task | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const archived = useQuery({
    queryKey: queryKeys.tasks.list('archived'),
    queryFn: ({ signal }) => tasksApi.list('archived', signal),
    staleTime: 15_000,
  });

  function invalidateWrites() {
    for (const key of invalidation.afterTaskWrite) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const restore = useMutation({
    mutationFn: (taskId: string) => tasksApi.update(taskId, { status: 'open' }),
    onMutate: async (taskId) => {
      setActionError(null);
      const key = queryKeys.tasks.list('archived');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData<Task[]>(key, (tasks = []) =>
        tasks.filter((task) => task.id !== taskId),
      );
      return { previous };
    },
    onError: (caught, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.tasks.list('archived'), context.previous);
      }
      setActionError(describeApiError(caught));
    },
    onSuccess: () => {
      setSelectedId(null);
      invalidateWrites();
    },
    onSettled: invalidateWrites,
  });

  const purge = useMutation({
    mutationFn: (taskId: string) => tasksApi.purge(taskId),
    onMutate: async (taskId) => {
      setActionError(null);
      const key = queryKeys.tasks.list('archived');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData<Task[]>(key, (tasks = []) =>
        tasks.filter((task) => task.id !== taskId),
      );
      return { previous };
    },
    onError: (caught, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.tasks.list('archived'), context.previous);
      }
      setActionError(describeApiError(caught));
    },
    onSuccess: () => {
      setPurgeTarget(null);
      setSelectedId(null);
      invalidateWrites();
    },
    onSettled: invalidateWrites,
  });

  const tasks = archived.data ?? [];

  return (
    <div className="trash-page">
      <header className="trash-hero">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__pip" aria-hidden="true" />
            TRASH / ARCHIVE
          </p>
          <h1>Nothing is gone until you say so.</h1>
          <p className="trash-hero__lede">
            Archived tasks wait here. Restore them to the ledger or delete them permanently.
          </p>
        </div>
        <span className="trash-count">
          {String(tasks.length).padStart(2, '0')}
          <span>ARCHIVED</span>
        </span>
      </header>

      {actionError ? (
        <div className="tasks-banner" role="alert">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {archived.isPending ? (
        <div className="trash-loading" aria-label="Loading trash">
          <span />
          <span />
          <span />
        </div>
      ) : archived.isError ? (
        <div className="tasks-empty">
          <p className="mono-label">TRASH OFFLINE</p>
          <h2>The archive couldn’t be read.</h2>
          <p>{describeApiError(archived.error)}</p>
          <button className="btn btn--ghost" type="button" onClick={() => void archived.refetch()}>
            Try again
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="tasks-empty">
          <p className="mono-label">TRASH IS CLEAR</p>
          <h2>Nothing archived.</h2>
          <p>Archived tasks rest here until you purge them.</p>
        </div>
      ) : (
        <ul className="trash-list">
          {tasks.map((task) => (
            <li className="trash-row" key={task.id}>
              <button className="trash-row__body" type="button" onClick={() => setSelectedId(task.id)}>
                <span className="trash-row__title">{task.title}</span>
                <span className="trash-row__meta">
                  {sourceLabel(task.source)}
                  {task.tags.length > 0
                    ? ` · ${task.tags.map((tag) => `#${tag}`).join(' ')}`
                    : ''}
                </span>
              </button>
              <span className={`tag tag--${task.priority}`}>{task.priority}</span>
              <span className="trash-row__created">Created {createdLabel(task.created_at)}</span>
              <div className="trash-row__actions">
                <button
                  className="btn btn--ghost btn--small"
                  type="button"
                  onClick={() => restore.mutate(task.id)}
                  disabled={restore.isPending}
                >
                  Restore
                </button>
                <button
                  className="btn btn--danger btn--small"
                  type="button"
                  onClick={() => setPurgeTarget(task)}
                  disabled={purge.isPending}
                >
                  Purge
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selectedId ? (
        <TaskDrawer taskId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}

      {purgeTarget ? (
        <ConfirmDialog
          title={`Delete “${purgeTarget.title}” forever?`}
          body="This removes the task from the database. It cannot be undone."
          confirmLabel="Delete forever"
          destructive
          busy={purge.isPending}
          onConfirm={() => purge.mutate(purgeTarget.id)}
          onCancel={() => setPurgeTarget(null)}
        />
      ) : null}
    </div>
  );
}
