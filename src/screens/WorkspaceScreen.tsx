/**
 * WorkspaceScreen — /workspace
 *
 * Layout:
 *  ┌──────────────────────────────┬───────────────┐
 *  │  header (problem title + URL)│               │
 *  ├──────────────────────────────│  MrtSidebar   │
 *  │  CodeEditor (full height)    │  (always-on)  │
 *  │  [Run button]                │               │
 *  │  SolveDebrief (post-run)     │               │
 *  └──────────────────────────────┴───────────────┘
 *
 * Data flows:
 *  - workspaceApi.run()  → RunResult → SolveDebrief
 *  - leetCodeApi.logAttempt() → SM-2 → review task in ledger
 *  - workspaceApi.debrief()  → DebriefResult → SolveDebrief
 *  - leetCodeApi.stats()     → PatternStat[] → MrtSidebar
 *  - booksApi.getDailyInspiration() → BookIdeaItem → MrtSidebar
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { CodeEditor } from '@/components/CodeEditor';
import { MrtSidebar } from '@/components/MrtSidebar';
import { SolveDebrief } from '@/components/SolveDebrief';
import {
  ApiError,
  booksApi,
  leetCodeApi,
  workspaceApi,
} from '@/lib/api';
import type { LogAttemptInput } from '@/lib/api';
import type { DebriefResult, RunResult } from '@/lib/api/schemas/workspace';
import { defaultSnippets } from '@/lib/api/schemas/workspace';
import type { WorkspaceLanguage } from '@/lib/api/schemas/workspace';
import type { MrtTone } from '@/components/MrtSidebar';
import { invalidation, queryKeys } from '@/lib/query/keys';

// ---------------------------------------------------------------------------
// Error description helper (mirrors BriefScreen)
// ---------------------------------------------------------------------------

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503) return error.message || 'Service temporarily unavailable.';
    return error.message || `Request failed (${error.status || 'network'}).`;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function WorkspaceScreen() {
  const queryClient = useQueryClient();

  // ── Editor state ──────────────────────────────────────────────────
  const [language, setLanguage] = useState<WorkspaceLanguage>('python');
  const [code, setCode] = useState<string>(defaultSnippets['python']);
  const [problemTitle, setProblemTitle] = useState('');
  const [problemUrl, setProblemUrl] = useState('');

  // ── Run/debrief results ───────────────────────────────────────────
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [debriefResult, setDebriefResult] = useState<DebriefResult | null>(null);
  const [tone, setTone] = useState<MrtTone>('mentor');

  // Active pattern (set after user picks one in the log form, tracked here
  // to update the sidebar immediately).
  const [activePatternName, setActivePatternName] = useState<string | undefined>();
  const [prevAvgTimeMs, setPrevAvgTimeMs] = useState<number | undefined>();

  // ── Queries ───────────────────────────────────────────────────────
  const inspiration = useQuery({
    queryKey: queryKeys.inspiration.daily,
    queryFn: ({ signal }) => booksApi.getDailyInspiration(signal),
    retry: false,
    staleTime: 3_600_000,
  });

  const patterns = useQuery({
    queryKey: queryKeys.leetcode.patterns,
    queryFn: ({ signal }) => leetCodeApi.listPatterns(signal),
    staleTime: 60_000,
  });

  const stats = useQuery({
    queryKey: queryKeys.leetcode.stats,
    queryFn: ({ signal }) => leetCodeApi.stats(signal),
    staleTime: 60_000,
  });

  // Derive the stat row for the active pattern.
  const activeStats = stats.data?.find(
    (s) => s.pattern.toLowerCase() === (activePatternName ?? '').toLowerCase(),
  );

  // Derive prev avg time for the active pattern (avg_time_min → ms).
  // Update whenever activePatternName changes.
  const derivedPrevAvgMs = activeStats
    ? Math.round(activeStats.avg_time_min * 60_000)
    : undefined;

  // ── Run mutation ──────────────────────────────────────────────────
  const runMutation = useMutation({
    mutationFn: () =>
      workspaceApi.run({
        language,
        code,
        problem_title: problemTitle.trim() || undefined,
        problem_url: problemUrl.trim() || undefined,
      }),
    onSuccess: (result) => {
      setRunResult(result);
      setDebriefResult(null); // reset previous debrief
    },
  });

  // ── Log attempt mutation ──────────────────────────────────────────
  const logMutation = useMutation({
    mutationFn: (input: LogAttemptInput) => leetCodeApi.logAttempt(input),
    onSuccess: (_data, input) => {
      // Update sidebar pattern name immediately.
      const patternRow = patterns.data?.find((p) => p.id === input.pattern_id);
      if (patternRow) {
        setActivePatternName(patternRow.name);
        setPrevAvgTimeMs(derivedPrevAvgMs);
      }
      // Invalidate tasks/brief (SM-2 may have created a review task).
      for (const key of invalidation.afterWorkspaceRun) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      // Trigger debrief.
      if (runResult) {
        const isWin = runResult.exit_code === 0 && !input.needed_help;
        const beatAvg = derivedPrevAvgMs
          ? runResult.time_ms < derivedPrevAvgMs
          : false;
        const resolvedTone: MrtTone = isWin && beatAvg ? 'hype' : 'mentor';
        setTone(resolvedTone);

        debriefMutation.mutate({
          submission_id: runResult.submission_id,
          pattern: patternRow?.name,
          difficulty: input.difficulty,
          time_ms: runResult.time_ms,
          needed_help: input.needed_help ?? false,
          prev_avg_time_ms: derivedPrevAvgMs,
          exit_code: runResult.exit_code,
        });
      }
    },
  });

  // ── Debrief mutation ──────────────────────────────────────────────
  const debriefMutation = useMutation({
    mutationFn: (input: Parameters<typeof workspaceApi.debrief>[0]) =>
      workspaceApi.debrief(input),
    onSuccess: (result) => {
      setDebriefResult(result);
    },
  });

  // ── Language change: reset code to snippet ────────────────────────
  function handleLanguageChange(lang: WorkspaceLanguage) {
    setLanguage(lang);
    setCode(defaultSnippets[lang]);
    setRunResult(null);
    setDebriefResult(null);
  }

  // ── Dismiss run output ────────────────────────────────────────────
  function handleDismiss() {
    setRunResult(null);
    setDebriefResult(null);
    setTone('mentor');
  }

  const isRunning = runMutation.isPending;

  return (
    <div className="ws-page">
      {/* ── Problem header ──────────────────────────────────────────── */}
      <header className="ws-header">
        <div className="ws-header__fields">
          <label className="field field--compact ws-header__title">
            <span className="visually-hidden">Problem title</span>
            <input
              type="text"
              placeholder="Problem title…"
              value={problemTitle}
              onChange={(e) => setProblemTitle(e.target.value)}
              disabled={isRunning}
            />
          </label>
          <label className="field field--compact ws-header__url">
            <span className="visually-hidden">LeetCode URL</span>
            <input
              type="url"
              placeholder="https://leetcode.com/problems/…"
              value={problemUrl}
              onChange={(e) => setProblemUrl(e.target.value)}
              disabled={isRunning}
            />
          </label>
        </div>
        <span className="mono-label mono-label--muted">WORKSPACE</span>
      </header>

      {/* ── Two-column body ─────────────────────────────────────────── */}
      <div className="ws-layout">
        {/* Left: editor + run + output */}
        <div className="ws-editor-col">
          <div className="ws-editor-panel">
            <CodeEditor
              value={code}
              onChange={setCode}
              language={language}
              onLanguageChange={handleLanguageChange}
              disabled={isRunning}
              label={problemTitle || 'Code editor'}
            />
          </div>

          {/* Run button */}
          <div className="ws-run-row">
            <button
              className={`btn btn--ink ws-run-btn${isRunning ? ' ws-run-btn--running' : ''}`}
              type="button"
              onClick={() => runMutation.mutate()}
              disabled={isRunning || !code.trim()}
            >
              {isRunning ? 'Running…' : 'Run'}
            </button>
            {runMutation.isError ? (
              <p className="inline-error" role="alert">
                {describeError(runMutation.error)}
              </p>
            ) : null}
          </div>

          {/* Post-run output */}
          {runResult ? (
            <SolveDebrief
              result={runResult}
              debrief={debriefResult ?? undefined}
              isLoadingDebrief={debriefMutation.isPending}
              patterns={patterns.data ?? []}
              onLog={(input) => logMutation.mutate(input)}
              isLoggingAttempt={logMutation.isPending}
              onDismiss={handleDismiss}
              problemUrl={problemUrl}
              problemTitle={problemTitle}
              prevAvgTimeMs={prevAvgTimeMs ?? derivedPrevAvgMs}
            />
          ) : null}

          {logMutation.isError ? (
            <p className="inline-error" role="alert">
              {describeError(logMutation.error)}
            </p>
          ) : null}
          {debriefMutation.isError ? (
            <p className="inline-error" role="alert">
              {describeError(debriefMutation.error)}
            </p>
          ) : null}
        </div>

        {/* Right: MrT sidebar */}
        <MrtSidebar
          pattern={activePatternName}
          stats={activeStats}
          sessionTip={inspiration.data ?? undefined}
          isTipLoading={inspiration.isPending}
          isTipError={inspiration.isError}
          tone={tone}
          language={language}
        />
      </div>
    </div>
  );
}
