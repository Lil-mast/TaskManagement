import { useCallback, useEffect, useState } from 'react';

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * First-load title sequence. It covers the app for roughly two seconds, can
 * be skipped with any key or the button, and respects reduced-motion. The
 * page mounts and fetches underneath it, so the intro never delays data.
 */
export function Intro() {
  const [leaving, setLeaving] = useState(false);
  const [hidden, setHidden] = useState(false);

  const leave = useCallback(() => {
    setLeaving(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(leave, prefersReducedMotion() ? 450 : 1450);
    return () => window.clearTimeout(timer);
  }, [leave]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(
      () => setHidden(true),
      prefersReducedMotion() ? 140 : 620,
    );
    return () => window.clearTimeout(timer);
  }, [leaving]);

  useEffect(() => {
    if (hidden) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        leave();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hidden, leave]);

  useEffect(() => {
    if (hidden) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [hidden]);

  if (hidden) return null;

  return (
    <div className={`intro${leaving ? ' intro--leaving' : ''}`}>
      <button className="intro__skip" type="button" onClick={leave}>
        Skip intro
      </button>

      <div className="intro__stage">
        <div className="intro__topline">
          <span className="intro__meta">
            <span className="intro__pip" aria-hidden="true" />
            MRT // DAILY INTELLIGENCE
          </span>
          <span className="intro__meta intro__meta--right">07:10 / LOCAL</span>
        </div>

        <div className="intro__word" role="img" aria-label="MrT">
          <span className="intro__letter intro__letter--m" aria-hidden="true">
            M
          </span>
          <span className="intro__letter intro__letter--r" aria-hidden="true">
            r
          </span>
          <span className="intro__letter intro__t" aria-hidden="true">
            <span>T</span>
          </span>
        </div>

        <div className="intro__rule" aria-hidden="true" />

        <div className="intro__legend">
          <span>PROPOSE</span>
          <span className="intro__arrow" aria-hidden="true">
            →
          </span>
          <span>DECIDE</span>
          <span className="intro__arrow" aria-hidden="true">
            →
          </span>
          <span>MOVE</span>
        </div>
      </div>
    </div>
  );
}
