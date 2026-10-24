import { useEffect, useState } from 'react';

import type { DailyChallenge } from '@/lib/api/schemas/briefing';

type Phase = 'idle' | 'running' | 'expired';

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface DailyDrillProps {
  challenge: DailyChallenge;
  source?: 'ai' | 'offline';
}

export function DailyDrill({ challenge, source = 'ai' }: DailyDrillProps) {
  const totalSeconds = Math.max(1, challenge.time_limit_min) * 60;
  const [phase, setPhase] = useState<Phase>('idle');
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(totalSeconds);
  const [hintsShown, setHintsShown] = useState(0);

  useEffect(() => {
    if (phase !== 'running' || endsAt === null) return;

    let timeoutId = 0;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setPhase('expired');
        setEndsAt(null);
        return;
      }
      timeoutId = window.setTimeout(tick, 250);
    };

    tick();
    return () => window.clearTimeout(timeoutId);
  }, [endsAt, phase]);

  function start() {
    setRemaining(totalSeconds);
    setEndsAt(Date.now() + totalSeconds * 1000);
    setPhase('running');
  }

  function reveal() {
    setRemaining(0);
    setEndsAt(null);
    setPhase('expired');
  }

  function reset() {
    setRemaining(totalSeconds);
    setEndsAt(null);
    setPhase('idle');
    setHintsShown(0);
  }

  const shownHints = challenge.hints.slice(0, hintsShown);
  const canShowHint = hintsShown < challenge.hints.length;
  const clock = phase === 'idle' ? totalSeconds : remaining;

  return (
    <section className="drill" aria-label="Daily DSA drill">
      <header className="drill__head">
        <div className="drill__headline">
          <span className="mono-label">DAILY DRILL</span>
          <span className="drill__meta">
            {challenge.pattern} · {challenge.difficulty} · {challenge.time_limit_min} MIN
          </span>
        </div>
        <span className="mono-label mono-label--muted">
          {source === 'offline' ? 'SAVED PRACTICE · AI OFFLINE' : 'AI-GENERATED PRACTICE'}
        </span>
      </header>

      <div className="drill__body">
        <div className="drill__problem">
          <h2>{challenge.title}</h2>
          <p className="drill__prompt">{challenge.prompt}</p>

          {challenge.examples.length > 0 ? (
            <div className="drill__section">
              <p className="mono-label">EXAMPLES</p>
              <div className="drill__examples">
                {challenge.examples.map((example, index) => (
                  <div className="drill__example" key={`${example.input}-${index}`}>
                    <p>
                      <span className="mono-label">INPUT</span>
                      <code>{example.input}</code>
                    </p>
                    <p>
                      <span className="mono-label">OUTPUT</span>
                      <code>{example.output}</code>
                    </p>
                    {example.explanation ? (
                      <p className="drill__explanation">{example.explanation}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {challenge.constraints.length > 0 ? (
            <div className="drill__section">
              <p className="mono-label">CONSTRAINTS</p>
              <ul className="drill__constraints">
                {challenge.constraints.map((constraint) => (
                  <li key={constraint}>{constraint}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <aside className="drill__rail">
          <div className={`drill__clock drill__clock--${phase}`} role="timer" aria-label="Time remaining">
            <span className="drill__clock-value">{formatClock(clock)}</span>
            <span className="mono-label">
              {phase === 'idle' ? 'TIME LIMIT' : phase === 'running' ? 'REMAINING' : 'TIME UP'}
            </span>
          </div>

          {phase === 'idle' ? (
            <button className="btn btn--ink" type="button" onClick={start}>
              Start {challenge.time_limit_min} min
            </button>
          ) : phase === 'running' ? (
            <button className="btn btn--ghost" type="button" onClick={reveal}>
              Reveal answer
            </button>
          ) : (
            <div className="drill__expired">
              <span className="mono-label">ANSWER REVEALED</span>
              <button className="btn btn--ghost btn--small" type="button" onClick={reset}>
                Run it again
              </button>
            </div>
          )}

          {challenge.hints.length > 0 ? (
            <div className="drill__hints">
              <p className="mono-label">HINTS</p>
              {shownHints.length > 0 ? (
                <ol>
                  {shownHints.map((hint, index) => (
                    <li key={`${hint}-${index}`}>{hint}</li>
                  ))}
                </ol>
              ) : (
                <p className="drill__hint-empty">No hints revealed.</p>
              )}
              {canShowHint ? (
                <button
                  className="link-button"
                  type="button"
                  onClick={() => setHintsShown((count) => count + 1)}
                >
                  Show hint {hintsShown + 1} / {challenge.hints.length}
                </button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      {phase === 'expired' ? (
        <section className="drill__answer" aria-live="polite">
          <header className="drill__answer-head">
            <span className="mono-label">REFERENCE ANSWER</span>
            <span className="mono-label mono-label--muted">{challenge.language}</span>
          </header>
          <div className="drill__answer-copy">
            <h3>Approach</h3>
            <p>{challenge.approach}</p>
            <p>
              <span className="mono-label">COMPLEXITY</span> {challenge.complexity}
            </p>
          </div>
          <pre className="drill__code">
            <code>{challenge.code}</code>
          </pre>
        </section>
      ) : null}
    </section>
  );
}
