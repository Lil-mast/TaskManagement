/**
 * SolveDebrief — post-run panel rendered below the code editor.
 *
 * Sections (in order):
 *  1. Execution output — stdout + stderr in a styled <pre>, exit badge, timing
 *  2. Log attempt form — pattern selector, difficulty, time, help checkbox, notes
 *  3. MrT debrief (appears after log is submitted) — tone-aware message block
 *  4. Matched Pragmatic Programmer tip (compact BooksInspirationCard)
 *  5. Stat delta line ("−4 min vs avg · no help ✓")
 */

import { type FormEvent, useState } from 'react';

import { BooksInspirationCard } from '@/components/BooksInspirationCard';
import type { LeetCodePattern, LogAttemptInput } from '@/lib/api';
import type { DebriefResult, RunResult } from '@/lib/api/schemas/workspace';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function deltaLabel(timeMs: number, prevAvgMs?: number): string | null {
  if (!prevAvgMs || prevAvgMs <= 0) return null;
  const diffSec = Math.round((timeMs - prevAvgMs) / 1000);
  if (diffSec < 0) return `${Math.abs(diffSec)}s faster than your avg`;
  if (diffSec > 0) return `${diffSec}s slower than your avg`;
  return 'matched your avg';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SolveDebriefProps {
  result: RunResult;
  /** Set after user submits the log form and debrief resolves. */
  debrief?: DebriefResult;
  isLoadingDebrief: boolean;
  /** Available patterns for the log form selector. */
  patterns: LeetCodePattern[];
  /** Called when user submits the log form. */
  onLog: (input: LogAttemptInput) => void;
  isLoggingAttempt: boolean;
  /** Called when user dismisses/clears the debrief panel. */
  onDismiss: () => void;
  /** Problem URL to pre-fill in the log form (from workspace header). */
  problemUrl?: string;
  /** Problem title to pre-fill (from workspace header). */
  problemTitle?: string;
  /** User's average time for the selected pattern (for delta display). */
  prevAvgTimeMs?: number;
}

export function SolveDebrief({
  result,
  debrief,
  isLoadingDebrief,
  patterns,
  onLog,
  isLoggingAttempt,
  onDismiss,
  problemUrl = '',
  problemTitle = '',
  prevAvgTimeMs,
}: SolveDebriefProps) {
  // ── Log form state ──────────────────────────────────────────────────
  const [patternId, setPatternId] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [neededHelp, setNeededHelp] = useState(false);
  const [notes, setNotes] = useState('');
  const [logSubmitted, setLogSubmitted] = useState(false);

  // Time is captured directly from the run result (ms → min for display).
  const timeTakenMin = Math.max(1, Math.round(result.time_ms / 60_000));

  function handleLog(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = problemUrl.trim() || `https://leetcode.com/problems/unknown-${Date.now()}`;
    onLog({
      problem_url: url,
      problem_title: problemTitle.trim() || undefined,
      difficulty,
      pattern_id: patternId || undefined,
      time_taken_min: timeTakenMin,
      needed_help: neededHelp,
      notes: notes.trim() || undefined,
    });
    setLogSubmitted(true);
  }

  const delta = deltaLabel(result.time_ms, prevAvgTimeMs);
  const hasOutput = result.stdout.trim().length > 0 || result.stderr.trim().length > 0;

  return (
    <section className="ws-debrief" aria-label="Run result and debrief">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="ws-debrief__head">
        <div className="ws-debrief__meta">
          <span className="mono-label">RUN OUTPUT</span>
          <span
            className={`ws-debrief__exit-badge ${
              result.exit_code === 0
                ? 'ws-debrief__exit-badge--ok'
                : 'ws-debrief__exit-badge--err'
            }`}
          >
            {result.exit_code === 0 ? 'EXIT 0' : `EXIT ${result.exit_code}`}
          </span>
          <span className="mono-label mono-label--muted">
            {result.timed_out ? 'TIMED OUT' : formatMs(result.time_ms)}
            {' · '}
            {result.language.toUpperCase()}
          </span>
        </div>
        <button
          className="ws-debrief__dismiss"
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss run output"
        >
          Clear
        </button>
      </header>

      {/* ── stdout / stderr ───────────────────────────────────────────── */}
      {hasOutput ? (
        <div className="ws-debrief__output">
          {result.stdout.trim() ? (
            <pre className="ws-debrief__pre ws-debrief__pre--stdout">
              <code>{result.stdout}</code>
            </pre>
          ) : null}
          {result.stderr.trim() ? (
            <pre className="ws-debrief__pre ws-debrief__pre--stderr">
              <span className="mono-label">STDERR</span>
              <code>{result.stderr}</code>
            </pre>
          ) : null}
        </div>
      ) : (
        <p className="ws-debrief__no-output">No output produced.</p>
      )}

      {/* ── Log attempt form ─────────────────────────────────────────── */}
      {!logSubmitted ? (
        <form className="ws-debrief__log-form" onSubmit={handleLog} aria-label="Log this attempt">
          <p className="mono-label">LOG ATTEMPT</p>

          <div className="ws-debrief__form-row">
            {/* Pattern selector */}
            <label className="field field--compact">
              <span className="visually-hidden">Pattern</span>
              <select
                value={patternId}
                onChange={(e) => setPatternId(e.target.value)}
                disabled={isLoggingAttempt}
              >
                <option value="">Pattern (optional)</option>
                {patterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Difficulty */}
            <label className="field field--compact">
              <span className="visually-hidden">Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                disabled={isLoggingAttempt}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          </div>

          {/* Needed help checkbox */}
          <label className="ws-debrief__checkbox">
            <input
              type="checkbox"
              checked={neededHelp}
              onChange={(e) => setNeededHelp(e.target.checked)}
              disabled={isLoggingAttempt}
            />
            <span>Needed a hint or hint/solution lookup</span>
          </label>

          {/* Notes */}
          <label className="field field--compact">
            <span className="visually-hidden">Notes</span>
            <textarea
              className="ws-debrief__notes"
              placeholder="Notes (approach, gotchas, what to review)…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isLoggingAttempt}
              rows={2}
            />
          </label>

          <button
            className="btn btn--ink btn--small"
            type="submit"
            disabled={isLoggingAttempt}
          >
            {isLoggingAttempt ? 'Logging…' : 'Log attempt + get debrief'}
          </button>
        </form>
      ) : null}

      {/* ── MrT debrief message ───────────────────────────────────────── */}
      {isLoadingDebrief ? (
        <div className="ws-debrief__mrt-loading" aria-busy="true" aria-label="MrT is thinking">
          <span className="mono-label">MRT IS THINKING…</span>
          <div className="ws-debrief__mrt-skeleton" />
          <div className="ws-debrief__mrt-skeleton ws-debrief__mrt-skeleton--short" />
        </div>
      ) : debrief ? (
        <div
          className={`ws-debrief__mrt ws-debrief__mrt--${debrief.tone}`}
          aria-live="polite"
        >
          <header className="ws-debrief__mrt-head">
            <span className="mono-label">
              {debrief.tone === 'hype' ? 'MRT SAYS' : 'MENTOR DEBRIEF'}
            </span>
            {delta ? (
              <span className="ws-debrief__delta">
                {delta}
                {!neededHelp ? ' · no help ✓' : ''}
              </span>
            ) : !neededHelp ? (
              <span className="ws-debrief__delta">no help ✓</span>
            ) : null}
          </header>

          <p className="ws-debrief__mrt-message">{debrief.message}</p>

          {/* Matched Pragmatic Programmer tip */}
          <div className="ws-debrief__tip">
            <p className="mono-label">PRINCIPLE APPLIED</p>
            <BooksInspirationCard
              compact
              inspiration={{
                book: 'The Pragmatic Programmer',
                chapter: debrief.tip.chapter,
                idea: debrief.tip.idea,
                application: debrief.tip.application,
                tags: [],
              }}
              alternatives={[]}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
