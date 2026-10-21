import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { CloseIcon } from '@/components/icons';
import { ApiError, captureApi, tasksApi } from '@/lib/api';
import type { Confidence, Priority } from '@/lib/api/schemas/common';
import { invalidation, queryKeys } from '@/lib/query/keys';
import {
  describeApiError,
  parseTags,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
} from '@/lib/task-ui';

const PROMPTS = [
  'Call the dentist tomorrow at 3pm, finish the metrics report before Monday…',
  'Book a practice interview this week, reply to the reschedule thread…',
  'Read the Cloudflare post, plan the migration, drop the newsletter…',
];

interface ProposalDraft {
  key: string;
  selected: boolean;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
  tags: string;
  confidence: Confidence | null;
}

function safeReturn(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/brief';
}

export function CaptureScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const returnTo = safeReturn(params.get('return'));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);
  const [proposals, setProposals] = useState<ProposalDraft[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [acceptMessage, setAcceptMessage] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualPriority, setManualPriority] = useState<Priority>('now');
  const [manualDue, setManualDue] = useState('');

  useEffect(() => {
    document.title = 'Capture · MrT';
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!focused || text.length > 0) return;
    const timer = window.setInterval(
      () => setPromptIndex((index) => (index + 1) % PROMPTS.length),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [focused, text.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        navigate(returnTo, { replace: true });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, returnTo]);

  function invalidateWrites() {
    for (const key of invalidation.afterTaskWrite) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
  }

  const classify = useMutation({
    mutationFn: () => captureApi.create({ text: text.trim(), persist: false }),
    onSuccess: (response) => {
      setAcceptMessage(null);
      setAcceptError(null);
      setEditing(null);
      setProposals(
        response.tasks.map((task, index) => ({
          key: `${Date.now()}-${index}`,
          selected: false,
          title: task.title,
          description: task.description ?? '',
          priority: task.priority,
          dueDate: task.due_date ?? '',
          tags: task.tags.join(', '),
          confidence: task.confidence ?? null,
        })),
      );
    },
    onMutate: () => {
      setAcceptError(null);
      setAcceptMessage(null);
    },
  });

  const offline = classify.isError && classify.error instanceof ApiError && classify.error.status === 503;

  useEffect(() => {
    if (!offline || manualTitle) return;
    setManualTitle(text.trim().split('\n')[0]?.slice(0, 160) ?? '');
    setManualOpen(true);
  }, [manualTitle, offline, text]);

  const accept = useMutation({
    mutationFn: async () => {
      const chosen = proposals.filter((proposal) => proposal.selected);
      const createdKeys: string[] = [];
      const failed: string[] = [];
      for (const proposal of chosen) {
        try {
          await tasksApi.create({
            title: proposal.title.trim(),
            description: proposal.description.trim() || undefined,
            priority: proposal.priority,
            due_date: proposal.dueDate || undefined,
            tags: parseTags(proposal.tags).length > 0 ? parseTags(proposal.tags) : undefined,
            source: 'nl_capture',
          });
          createdKeys.push(proposal.key);
        } catch (error) {
          failed.push(`${proposal.title}: ${describeApiError(error)}`);
        }
      }
      return { createdKeys, failed };
    },
    onSuccess: ({ createdKeys, failed }) => {
      if (createdKeys.length > 0) {
        setProposals((current) => current.filter((proposal) => !createdKeys.includes(proposal.key)));
        invalidateWrites();
      }
      if (failed.length > 0) {
        setAcceptError(failed.join(' · '));
        return;
      }
      if (createdKeys.length > 0) {
        if (returnTo.startsWith('/onboarding')) {
          navigate(returnTo, { replace: true });
          return;
        }
        setAcceptMessage(
          `${createdKeys.length} ${createdKeys.length === 1 ? 'task' : 'tasks'} added to the ledger.`,
        );
      }
    },
    onError: (error) => setAcceptError(describeApiError(error)),
  });

  const manualCreate = useMutation({
    mutationFn: () =>
      tasksApi.create({
        title: manualTitle.trim(),
        priority: manualPriority,
        due_date: manualDue || undefined,
        source: 'user',
      }),
    onSuccess: () => {
      invalidateWrites();
      navigate(returnTo, { replace: true });
    },
  });

  const selectedCount = proposals.filter((proposal) => proposal.selected).length;
  const placeholder = useMemo(() => PROMPTS[promptIndex], [promptIndex]);

  function updateProposal(key: string, patch: Partial<ProposalDraft>) {
    setProposals((current) =>
      current.map((proposal) => (proposal.key === key ? { ...proposal, ...patch } : proposal)),
    );
  }

  function dismissProposal(key: string) {
    setProposals((current) => current.filter((proposal) => proposal.key !== key));
    if (editing === key) setEditing(null);
  }

  function captureMore() {
    setText('');
    setProposals([]);
    setEditing(null);
    setAcceptMessage(null);
    setAcceptError(null);
    setManualOpen(false);
    setManualTitle('');
    setManualDue('');
    setManualPriority('now');
    classify.reset();
    textareaRef.current?.focus();
  }

  function createManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualTitle.trim() || manualCreate.isPending) return;
    manualCreate.mutate();
  }

  return (
    <div className="capture-page">
      <header className="capture-header">
        <div className="capture-header__brand">
          <span className="capture-header__t" aria-hidden="true">
            T
          </span>
          <span className="mono-label">MRT // CAPTURE</span>
        </div>
        <button
          className="capture-close"
          type="button"
          onClick={() => navigate(returnTo, { replace: true })}
        >
          <CloseIcon />
          ESC · Close
        </button>
      </header>

      <main className="capture-main">
        <section className="capture-intro">
          <p className="eyebrow">
            <span className="eyebrow__pip" aria-hidden="true" />
            LANGUAGE IN / PROPOSALS OUT
          </p>
          <h1>Say it. MrT sorts it.</h1>
          <p>
            One sentence or a pile. MrT returns discrete proposals. Nothing enters the ledger
            until you select it.
          </p>
        </section>

        <section className="capture-composer" aria-label="Capture composer">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 500))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (text.trim() && !classify.isPending) classify.mutate();
              }
            }}
            placeholder={placeholder}
            maxLength={500}
            rows={5}
            aria-label="What do you need to capture?"
          />
          <div className="capture-composer__foot">
            <span className="mono-label mono-label--muted">{text.length} / 500</span>
            <div className="capture-composer__actions">
              <button
                className="link-button"
                type="button"
                onClick={() => setManualOpen((open) => !open)}
              >
                Create manually
              </button>
              <button
                className="btn btn--ink"
                type="button"
                onClick={() => classify.mutate()}
                disabled={!text.trim() || classify.isPending}
              >
                {classify.isPending ? 'Classifying…' : 'Classify'}
              </button>
            </div>
          </div>
        </section>

        {classify.isError ? (
          <div className="capture-offline" role="alert">
            <p className="mono-label">CLASSIFICATION UNAVAILABLE</p>
            <h2>Create the task manually.</h2>
            <p>{describeApiError(classify.error)}</p>
            {!manualOpen ? (
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => setManualOpen(true)}
              >
                Open manual form
              </button>
            ) : null}
          </div>
        ) : null}

        {proposals.length > 0 ? (
          <section className="proposals" aria-label="Capture proposals">
            <header className="proposals__head">
              <span>PROPOSALS {String(proposals.length).padStart(2, '0')}</span>
              <span>{selectedCount} SELECTED</span>
            </header>

            <div className="proposal-list">
              {proposals.map((proposal, index) => (
                <article
                  key={proposal.key}
                  className={`proposal ${proposal.selected ? 'proposal--selected' : ''}`}
                >
                  <label className="proposal__check">
                    <input
                      type="checkbox"
                      checked={proposal.selected}
                      onChange={(event) =>
                        updateProposal(proposal.key, { selected: event.target.checked })
                      }
                      aria-label={`Select ${proposal.title}`}
                    />
                  </label>

                  <div className="proposal__body">
                    <div className="proposal__topline">
                      <span className="mono-label">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="tag tag--crimson">
                        {proposal.confidence ?? 'PROPOSAL'}
                      </span>
                    </div>

                    {editing === proposal.key ? (
                      <div className="proposal__edit">
                        <label className="field field--compact">
                          <span className="field__label">Title</span>
                          <input
                            type="text"
                            value={proposal.title}
                            onChange={(event) =>
                              updateProposal(proposal.key, { title: event.target.value })
                            }
                            maxLength={160}
                          />
                        </label>
                        <div className="proposal__edit-row">
                          <label className="field field--compact">
                            <span className="field__label">Priority</span>
                            <select
                              value={proposal.priority}
                              onChange={(event) =>
                                updateProposal(proposal.key, {
                                  priority: event.target.value as Priority,
                                })
                              }
                            >
                              {PRIORITY_ORDER.map((priority) => (
                                <option key={priority} value={priority}>
                                  {PRIORITY_LABEL[priority]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field field--compact">
                            <span className="field__label">Due</span>
                            <input
                              type="date"
                              value={proposal.dueDate}
                              onChange={(event) =>
                                updateProposal(proposal.key, { dueDate: event.target.value })
                              }
                            />
                          </label>
                        </div>
                        <label className="field field--compact">
                          <span className="field__label">Tags</span>
                          <input
                            type="text"
                            value={proposal.tags}
                            onChange={(event) =>
                              updateProposal(proposal.key, { tags: event.target.value })
                            }
                            placeholder="work, writing"
                          />
                        </label>
                      </div>
                    ) : (
                      <>
                        <h3>{proposal.title}</h3>
                        <p className="proposal__meta">
                          {PRIORITY_LABEL[proposal.priority].toUpperCase()}
                          {proposal.dueDate ? ` · ${proposal.dueDate}` : ' · NO DATE'}
                          {proposal.tags.trim()
                            ? ` · ${parseTags(proposal.tags)
                                .map((tag) => `#${tag}`)
                                .join(' ')}`
                            : ''}
                        </p>
                        {proposal.description ? (
                          <p className="proposal__desc">{proposal.description}</p>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div className="proposal__actions">
                    <button
                      className="link-button"
                      type="button"
                      onClick={() =>
                        setEditing((current) =>
                          current === proposal.key ? null : proposal.key,
                        )
                      }
                    >
                      {editing === proposal.key ? 'Done' : 'Edit'}
                    </button>
                    <button
                      className="link-button link-button--danger"
                      type="button"
                      onClick={() => dismissProposal(proposal.key)}
                    >
                      Dismiss
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {acceptError ? (
              <p className="inline-error" role="alert">
                {acceptError}
              </p>
            ) : null}
            {acceptMessage ? (
              <div className="capture-success" role="status">
                <span>{acceptMessage}</span>
                <button className="link-button" type="button" onClick={captureMore}>
                  Capture more
                </button>
              </div>
            ) : null}

            <div className="proposal-footer">
              <button className="btn btn--ghost" type="button" onClick={captureMore}>
                Capture more
              </button>
              <button
                className="btn btn--ink"
                type="button"
                onClick={() => accept.mutate()}
                disabled={selectedCount === 0 || accept.isPending}
              >
                {accept.isPending ? 'Accepting…' : `Accept selected (${selectedCount})`}
              </button>
            </div>
          </section>
        ) : null}

        {manualOpen ? (
          <form className="manual-task" onSubmit={createManual}>
            <header className="manual-task__head">
              <div>
                <p className="eyebrow">
                  <span className="eyebrow__pip" aria-hidden="true" />
                  MANUAL FALLBACK
                </p>
                <h2>Write the task yourself.</h2>
              </div>
              <button
                className="link-button"
                type="button"
                onClick={() => setManualOpen(false)}
              >
                Hide
              </button>
            </header>

            <label className="field">
              <span className="field__label">Title</span>
              <input
                type="text"
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                maxLength={160}
                required
              />
            </label>

            <div className="manual-task__row">
              <label className="field">
                <span className="field__label">Priority</span>
                <select
                  value={manualPriority}
                  onChange={(event) => setManualPriority(event.target.value as Priority)}
                >
                  {PRIORITY_ORDER.map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_LABEL[priority]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Due date</span>
                <input
                  type="date"
                  value={manualDue}
                  onChange={(event) => setManualDue(event.target.value)}
                />
              </label>
            </div>

            {manualCreate.isError ? (
              <p className="inline-error" role="alert">
                {describeApiError(manualCreate.error)}
              </p>
            ) : null}

            <button
              className="btn btn--ink"
              type="submit"
              disabled={!manualTitle.trim() || manualCreate.isPending}
            >
              {manualCreate.isPending ? 'Adding…' : 'Add to ledger'}
            </button>
          </form>
        ) : null}
      </main>
    </div>
  );
}
