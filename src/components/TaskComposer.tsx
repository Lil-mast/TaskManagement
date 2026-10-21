import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { tasksApi } from '@/lib/api';
import type { Priority, Task } from '@/lib/api/schemas/common';
import { describeApiError, parseTags } from '@/lib/task-ui';
import { invalidation } from '@/lib/query/keys';

interface TaskComposerProps {
  open: boolean;
  onClose: () => void;
  initialTitle?: string;
  onCreated?: (task: Task) => void;
}

export function TaskComposer({ open, onClose, initialTitle = '', onCreated }: TaskComposerProps) {
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('now');
  const [dueDate, setDueDate] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setDescription('');
    setPriority('now');
    setDueDate('');
    setTags('');
    const timer = window.setTimeout(() => titleRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, initialTitle]);

  const create = useMutation({
    mutationFn: () => {
      const parsedTags = parseTags(tags);
      return tasksApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        due_date: dueDate || undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
        source: 'user',
      });
    },
    onSuccess: (task) => {
      for (const key of invalidation.afterTaskWrite) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      onCreated?.(task);
      onClose();
    },
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !create.isPending) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [create.isPending, onClose, open]);

  if (!open) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || create.isPending) return;
    create.mutate();
  }

  return createPortal(
    <div className="modal" role="presentation" onMouseDown={() => !create.isPending && onClose()}>
      <div
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow__pip" aria-hidden="true" />
              NEW TASK
            </p>
            <h2 id="composer-title">Put it in the ledger.</h2>
          </div>
          <button
            className="modal__close"
            type="button"
            onClick={onClose}
            disabled={create.isPending}
            aria-label="Close new task"
          >
            Close
          </button>
        </div>

        <form className="task-composer" onSubmit={submit}>
          <label className="field">
            <span className="field__label">Title</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              required
              disabled={create.isPending}
            />
          </label>

          <label className="field">
            <span className="field__label">Description</span>
            <textarea
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              disabled={create.isPending}
            />
          </label>

          <div className="task-composer__row">
            <label className="field">
              <span className="field__label">Priority</span>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
                disabled={create.isPending}
              >
                <option value="now">Now — crises & deadlines</option>
                <option value="schedule">Schedule — growth & principles</option>
                <option value="delegate">Delegate — interruptions</option>
                <option value="drop">Drop — trivial</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={create.isPending}
              />
            </label>
          </div>

          <label className="field">
            <span className="field__label">Tags</span>
            <input
              type="text"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="work, writing, rust"
              disabled={create.isPending}
            />
          </label>

          {create.isError ? (
            <p className="inline-error" role="alert">
              {describeApiError(create.error)}
            </p>
          ) : null}

          <div className="modal__actions">
            <button
              className="btn btn--ghost"
              type="button"
              onClick={onClose}
              disabled={create.isPending}
            >
              Cancel
            </button>
            <button
              className="btn btn--ink"
              type="submit"
              disabled={!title.trim() || create.isPending}
            >
              {create.isPending ? 'Adding…' : 'Add task'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
