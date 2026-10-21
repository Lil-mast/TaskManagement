import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { tasksApi } from '@/lib/api';
import {
  TASK_STATUSES,
  type Priority,
  type Task,
  type TaskStatus,
} from '@/lib/api/schemas/common';
import { invalidation, queryKeys } from '@/lib/query/keys';
import {
  completedLabel,
  createdLabel,
  describeApiError,
  dueLabel,
  isOverdue,
  parseTags,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  sourceLabel,
  tagsText,
  taskConfidence,
} from '@/lib/task-ui';

interface TaskDrawerProps {
  taskId: string;
  onClose: () => void;
}

interface Draft {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
  tags: string;
}

function draftFromTask(task: Task): Draft {
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    dueDate: task.due_date ?? '',
    tags: tagsText(task.tags),
  };
}

export function TaskDrawer({ taskId, onClose }: TaskDrawerProps) {
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const lookups = useQueries({
    queries: TASK_STATUSES.map((status) => ({
      queryKey: queryKeys.tasks.list(status),
      queryFn: ({ signal }: { signal: AbortSignal }) => tasksApi.list(status, signal),
      staleTime: 15_000,
    })),
  });

  const task = lookups
    .flatMap((lookup) => lookup.data ?? [])
    .find((candidate) => candidate.id === taskId);
  const loading = !task && lookups.some((lookup) => lookup.isPending);
  const lookupError = lookups.find((lookup) => lookup.isError)?.error;

  useEffect(() => {
    const timer = window.setTimeout(() => panelRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!task || task.id === loadedId) return;
    const next = draftFromTask(task);
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setLoadedId(task.id);
    setConfirmClose(false);
  }, [task, loadedId]);

  const dirty = draft !== null && JSON.stringify(draft) !== baseline;

  const requestClose = useCallback(() => {
    if (dirty) setConfirmClose(true);
    else onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmPurge || confirmClose) return;
      requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmClose, confirmPurge, requestClose]);

  function invalidateWrites() {
    for (const key of invalidation.afterTaskWrite) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const save = useMutation({
    mutationFn: (value: Draft) =>
      tasksApi.update(taskId, {
        title: value.title.trim(),
        description: value.description.trim() ? value.description : null,
        priority: value.priority,
        due_date: value.dueDate || null,
        tags: parseTags(value.tags),
      }),
    onSuccess: () => {
      invalidateWrites();
      onClose();
    },
  });

  const setStatus = useMutation({
    mutationFn: (status: TaskStatus) => tasksApi.update(taskId, { status }),
    onSuccess: () => {
      invalidateWrites();
      onClose();
    },
  });

  const archive = useMutation({
    mutationFn: () => tasksApi.archive(taskId),
    onSuccess: () => {
      invalidateWrites();
      onClose();
    },
  });

  const purge = useMutation({
    mutationFn: () => tasksApi.purge(taskId),
    onSuccess: () => {
      invalidateWrites();
      onClose();
    },
  });

  const mutationError = save.error ?? setStatus.error ?? archive.error ?? purge.error;
  const busy = save.isPending || setStatus.isPending || archive.isPending || purge.isPending;

  return createPortal(
    <div className="drawer" role="presentation" onMouseDown={requestClose}>
      <aside
        className="drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Task detail"
        tabIndex={-1}
        ref={panelRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow__pip" aria-hidden="true" />
              TASK / {taskId.slice(0, 8)}
            </p>
            <h2>{task?.title ?? 'Task detail'}</h2>
          </div>
          <button className="drawer__close" type="button" onClick={requestClose}>
            Close
          </button>
        </header>

        {loading ? (
          <div className="drawer__skeleton" aria-label="Loading task">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : !task ? (
          <div className="drawer__empty">
            <h3>Task not found.</h3>
            <p>
              {lookupError
                ? describeApiError(lookupError)
                : 'It may have been purged, or it belongs to a different session.'}
            </p>
            <button className="btn btn--ghost" type="button" onClick={onClose}>
              Back to the ledger
            </button>
          </div>
        ) : draft ? (
          <>
            <div className="drawer__scroll">
              <form
                className="drawer__form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (draft.title.trim()) save.mutate(draft);
                }}
              >
                <label className="field">
                  <span className="field__label">Title</span>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    maxLength={160}
                    disabled={busy}
                    required
                  />
                </label>

                <label className="field">
                  <span className="field__label">Description</span>
                  <textarea
                    className="textarea"
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    rows={4}
                    disabled={busy}
                  />
                </label>

                <div className="field">
                  <span className="field__label">Priority</span>
                  <div className="priority-control" role="group" aria-label="Priority">
                    {PRIORITY_ORDER.map((priority) => (
                      <button
                        key={priority}
                        type="button"
                        className={`priority-control__item ${
                          draft.priority === priority ? 'priority-control__item--active' : ''
                        }`}
                        aria-pressed={draft.priority === priority}
                        onClick={() => setDraft({ ...draft, priority })}
                        disabled={busy}
                      >
                        {PRIORITY_LABEL[priority]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="drawer__row">
                  <label className="field">
                    <span className="field__label">Due date</span>
                    <input
                      type="date"
                      value={draft.dueDate}
                      onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
                      disabled={busy}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Tags</span>
                    <input
                      type="text"
                      value={draft.tags}
                      onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                      placeholder="work, writing"
                      disabled={busy}
                    />
                  </label>
                </div>

                <dl className="drawer__provenance">
                  <div>
                    <dt>Source</dt>
                    <dd>{sourceLabel(task.source)}</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>{taskConfidence(task) ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{createdLabel(task.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Completed</dt>
                    <dd>{completedLabel(task.completed_at)}</dd>
                  </div>
                  <div>
                    <dt>Due</dt>
                    <dd className={isOverdue(task.due_date) ? 'text-danger' : undefined}>
                      {task.due_date
                        ? `${dueLabel(task.due_date)} · ${format(parseISO(task.due_date), 'dd MMM yyyy')}`
                        : 'No date'}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{task.status}</dd>
                  </div>
                </dl>

                {mutationError ? (
                  <p className="inline-error" role="alert">
                    {describeApiError(mutationError)}
                  </p>
                ) : null}
              </form>
            </div>

            <footer className="drawer__actions">
              <div className="drawer__actions-left">
                {task.status === 'open' ? (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => setStatus.mutate('done')}
                    disabled={busy}
                  >
                    Mark done
                  </button>
                ) : null}
                {task.status === 'done' ? (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => setStatus.mutate('open')}
                    disabled={busy}
                  >
                    Reopen
                  </button>
                ) : null}
                {task.status === 'archived' ? (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => setStatus.mutate('open')}
                    disabled={busy}
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => archive.mutate()}
                    disabled={busy}
                  >
                    Archive
                  </button>
                )}
              </div>

              <div className="drawer__actions-right">
                {task.status === 'archived' ? (
                  <button
                    className="btn btn--danger"
                    type="button"
                    onClick={() => setConfirmPurge(true)}
                    disabled={busy}
                  >
                    Delete forever
                  </button>
                ) : null}
                <button
                  className="btn btn--ink"
                  type="button"
                  onClick={() => draft.title.trim() && save.mutate(draft)}
                  disabled={busy || !draft.title.trim() || !dirty}
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </footer>

            {confirmClose ? (
              <div className="drawer__guard" role="alertdialog" aria-label="Unsaved changes">
                <p>Discard your unsaved changes?</p>
                <div>
                  <button
                    className="btn btn--ghost btn--small"
                    type="button"
                    onClick={() => setConfirmClose(false)}
                  >
                    Keep editing
                  </button>
                  <button className="btn btn--danger btn--small" type="button" onClick={onClose}>
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </aside>

      {confirmPurge ? (
        <ConfirmDialog
          title={`Delete “${task?.title ?? 'this task'}” forever?`}
          body="This removes the task from the database. It cannot be undone."
          confirmLabel="Delete forever"
          destructive
          busy={purge.isPending}
          onConfirm={() => purge.mutate()}
          onCancel={() => setConfirmPurge(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
