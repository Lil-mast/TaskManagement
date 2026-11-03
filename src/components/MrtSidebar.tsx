/**
 * MrtSidebar — always-on mentor rail on the Workspace screen.
 *
 * Shows:
 *  1. MrT one-liner (tone-aware: hype | mentor)
 *  2. Pragmatic Programmer tip for today (compact BooksInspirationCard)
 *  3. Pattern stat mini-chart (attempts + no-help rate, CSS-only bars)
 *  4. Session context: language + pattern being practised
 */

import { BooksInspirationCard } from '@/components/BooksInspirationCard';
import type { BookIdeaItem } from '@/lib/api';
import type { PatternStat } from '@/lib/api/schemas/leetcode';
import type { WorkspaceLanguage } from '@/lib/api/schemas/workspace';
import { languageFullNames } from '@/lib/api/schemas/workspace';

// ---------------------------------------------------------------------------
// Static MrT one-liners keyed by tone
// ---------------------------------------------------------------------------

const MRT_LINES: Record<'hype' | 'mentor', string[]> = {
  hype: [
    "I pity the fool who gives up on this pattern! Keep grinding, sucker!",
    "You think Big O is scary? I've seen scarier! Get back to work, fool!",
    "Pain is temporary. A weak algorithm is forever. Fix it!",
    "Every rep makes you harder to beat. Don't stop now, fool!",
    "I ain't getting on no plane, but I AM watching your progress. Don't disappoint me!",
  ],
  mentor: [
    "Spaced repetition compounds. Every rep builds the recall that matters under pressure.",
    "The engineer who can name the invariant before touching the keyboard wins the interview.",
    "Complexity analysis is not academic — it's the language of trade-offs at scale.",
    "Master one pattern deeply before moving to the next. Breadth without depth is noise.",
    "The Pragmatic Programmer's rule: invest in your knowledge portfolio daily, not weekly.",
  ],
};

function pickLine(lines: string[], pattern?: string): string {
  // Seed deterministically by pattern name so the line stays stable per session,
  // but varies between patterns.
  const seed = pattern
    ? pattern.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    : Math.floor(Date.now() / 86_400_000); // changes daily if no pattern
  return lines[seed % lines.length] ?? lines[0];
}

// ---------------------------------------------------------------------------
// Stat bar sub-component (CSS-only, no chart lib)
// ---------------------------------------------------------------------------

interface StatBarProps {
  label: string;
  value: number;   // 0–1 for rate, or raw count
  max?: number;    // if provided, renders count/max
  unit?: string;
  accent?: boolean;
}

function StatBar({ label, value, max, unit = '', accent = false }: StatBarProps) {
  const pct = max !== undefined ? Math.min((value / Math.max(max, 1)) * 100, 100) : Math.min(value * 100, 100);
  const display = max !== undefined
    ? `${value}${unit}`
    : `${Math.round(value * 100)}%`;

  return (
    <div className="mrt-stat-bar">
      <div className="mrt-stat-bar__head">
        <span className="mono-label">{label}</span>
        <span className="mrt-stat-bar__value">{display}</span>
      </div>
      <div className="mrt-stat-bar__track">
        <div
          className={`mrt-stat-bar__fill${accent ? ' mrt-stat-bar__fill--accent' : ''}`}
          style={{ width: `${pct}%` }}
          role="presentation"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export type MrtTone = 'hype' | 'mentor';

interface MrtSidebarProps {
  /** Active pattern name, e.g. "Two Pointers". Undefined before user picks one. */
  pattern?: string;
  /** Stats row for the active pattern from leetCodeApi.stats(). */
  stats?: PatternStat;
  /** Today's Pragmatic Programmer tip (from booksApi.getDailyInspiration). */
  sessionTip?: BookIdeaItem;
  isTipLoading?: boolean;
  isTipError?: boolean;
  /** Current motivational tone — switches on solve quality. */
  tone: MrtTone;
  /** Active language for the session context label. */
  language?: WorkspaceLanguage;
}

export function MrtSidebar({
  pattern,
  stats,
  sessionTip,
  isTipLoading = false,
  isTipError = false,
  tone,
  language,
}: MrtSidebarProps) {
  const mrtLine = pickLine(MRT_LINES[tone], pattern);
  const hasStats = stats !== undefined;

  return (
    <aside className="ws-mrt-sidebar" aria-label="MrT mentor sidebar">
      {/* ── Identity strip ─────────────────────────────────── */}
      <header className="ws-mrt-header">
        <span className="mono-label">MRT</span>
        <span className="mono-label mono-label--muted">
          {tone === 'hype' ? 'HYPE MODE' : 'MENTOR MODE'}
        </span>
      </header>

      {/* ── Session context ────────────────────────────────── */}
      <div className="ws-mrt-context">
        {pattern ? (
          <p className="ws-mrt-pattern">{pattern}</p>
        ) : (
          <p className="ws-mrt-pattern ws-mrt-pattern--empty">No pattern selected</p>
        )}
        {language ? (
          <span className="tag">{languageFullNames[language]}</span>
        ) : null}
      </div>

      {/* ── MrT one-liner ─────────────────────────────────── */}
      <div className={`ws-mrt-line ws-mrt-line--${tone}`} aria-live="polite">
        <p>{mrtLine}</p>
      </div>

      {/* ── Pattern stats ─────────────────────────────────── */}
      {hasStats ? (
        <div className="ws-mrt-stats">
          <p className="mono-label">PATTERN STATS</p>
          <StatBar
            label="ATTEMPTS"
            value={stats.attempts}
            max={Math.max(stats.attempts, 20)}
            unit=""
          />
          <StatBar
            label="NO-HELP RATE"
            value={stats.no_help_rate}
            accent
          />
          <StatBar
            label="AVG TIME"
            value={stats.avg_time_min}
            max={Math.max(stats.avg_time_min, 30)}
            unit=" min"
          />
        </div>
      ) : pattern ? (
        <div className="ws-mrt-stats ws-mrt-stats--empty">
          <p className="mono-label">PATTERN STATS</p>
          <p className="ws-mrt-no-data">
            No attempts logged yet for {pattern}.
            <br />
            Solve a problem and log it to start tracking.
          </p>
        </div>
      ) : null}

      {/* ── Pragmatic Programmer tip ───────────────────────── */}
      <div className="ws-mrt-tip">
        <p className="mono-label">TODAY'S PRINCIPLE</p>
        <BooksInspirationCard
          compact
          inspiration={sessionTip ?? { book: '', idea: '', tags: [] }}
          alternatives={[]}
          isLoading={isTipLoading}
          isError={isTipError}
        />
      </div>

      {/* ── Reminder rule ─────────────────────────────────── */}
      <footer className="ws-mrt-rule">
        <span className="status-pip" aria-hidden="true" />
        <span className="mono-label">MrT proposes. You decide.</span>
      </footer>
    </aside>
  );
}
