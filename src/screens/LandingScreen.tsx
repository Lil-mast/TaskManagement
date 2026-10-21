import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Wordmark } from '@/components/Wordmark';
import { healthApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';

const today = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
})
  .format(new Date())
  .toUpperCase();

interface LandingScreenProps {
  onReplayIntro?: () => void;
}

export function LandingScreen({ onReplayIntro }: LandingScreenProps) {
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => healthApi.get(signal),
    retry: false,
    staleTime: 60_000,
  });

  const status = health.isPending ? 'CHECKING' : health.isSuccess ? 'SYSTEM OK' : 'OFFLINE';
  const statusClass = health.isPending
    ? 'status-pip status-pip--idle'
    : health.isSuccess
      ? 'status-pip'
      : 'status-pip status-pip--bad';

  return (
    <div className="landing">
      <header className="landing__header">
        <Wordmark to="/" />
        <nav className="landing__nav" aria-label="Primary">
          <a className="landing__nav-link" href="#how">
            How it works
          </a>
          <Link className="landing__nav-link" to="/login">
            Sign in
          </Link>
          <Link className="btn btn--crimson btn--small" to="/login?mode=signup">
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="landing__hero">
          <div className="landing__hero-main">
            <p className="eyebrow">
              <span className="eyebrow__pip" aria-hidden="true" />
              MRT // DAILY INTELLIGENCE
              <span className="eyebrow__aside">{today}</span>
            </p>

            <div className="landing__mark" aria-label="MrT">
              <Wordmark size="hero" />
            </div>

            <h1 className="landing__headline">
              Your day,
              <br />
              <span className="landing__accent">edited.</span>
            </h1>

            <div className="landing__hero-row">
              <p className="landing__lede">
                MrT reads the signals around you — tasks, calendar, inbox, reading, practice —
                and proposes one clear brief. Nothing moves until you say so.
              </p>
              <div className="landing__actions">
                <Link className="btn btn--ink" to="/login?mode=signup">
                  Get started
                </Link>
                <Link className="btn btn--ghost" to="/login">
                  Sign in
                </Link>
              </div>
            </div>
          </div>

          <aside className="edition" aria-label="Preview of a daily brief">
            <div className="edition__head">
              <span>THE DAILY EDITION</span>
              <span>07:10</span>
            </div>
            <div className="edition__body">
              <p className="edition__kicker">PREVIEW / A TUESDAY</p>
              <h2>Make room for the work that needs you.</h2>
              <ol className="edition__list">
                <li>
                  <span className="edition__num">01</span>
                  <span>Finish the migration brief</span>
                  <span className="tag tag--crimson">NOW</span>
                </li>
                <li>
                  <span className="edition__num">02</span>
                  <span>Review the architecture memo</span>
                  <span className="tag">SCHEDULE</span>
                </li>
                <li>
                  <span className="edition__num">03</span>
                  <span>25 min · dynamic programming drill</span>
                  <span className="tag">DRILL</span>
                </li>
              </ol>
            </div>
            <div className="edition__foot">
              <span className="status-pip" aria-hidden="true" />
              PROPOSED, NOT WRITTEN
            </div>
          </aside>
        </section>

        <ul className="landing__signals" aria-label="Signals MrT reads">
          {['CALENDAR', 'INBOX', 'DAILY.DEV', 'LEETCODE', 'PRINCIPLES'].map((signal) => (
            <li key={signal}>
              <span className="landing__signal-pip" aria-hidden="true" />
              {signal}
            </li>
          ))}
        </ul>

        <section className="landing__proof" id="how">
          <header className="section-head">
            <span>01 / HOW IT WORKS</span>
            <span>THREE MOVES</span>
          </header>

          <div className="proof-grid">
            <article className="proof">
              <span className="proof__num">01</span>
              <h2>Propose</h2>
              <p>
                Dump the day in natural language. MrT turns it into discrete proposals, each
                with a source, a confidence, and a reason. The ledger stays untouched.
              </p>
              <span className="proof__tag">CAPTURE</span>
            </article>

            <article className="proof">
              <span className="proof__num">02</span>
              <h2>Plan</h2>
              <p>
                Your real calendar, inbox, and practice history become the grounding. The brief
                names the few things worth doing — not a wall of widgets.
              </p>
              <span className="proof__tag">BRIEF</span>
            </article>

            <article className="proof">
              <span className="proof__num">03</span>
              <h2>Review</h2>
              <p>
                At the end of the week, see what moved, what slipped, and which patterns are
                getting stronger. Then adjust the next brief with evidence.
              </p>
              <span className="proof__tag">REVIEW</span>
            </article>
          </div>
        </section>

        <section className="landing__creed">
          <div className="landing__creed-mark" aria-hidden="true">
            T
          </div>
          <div>
            <p className="eyebrow">THE RULE</p>
            <p className="landing__creed-statement">
              MrT proposes.
              <br />
              <span>You decide.</span>
            </p>
            <p className="landing__creed-copy">
              No autonomous writes. No open-ended chat. The human decision is the product.
            </p>
          </div>
        </section>
      </main>

      <footer className="landing__footer">
        <span>MRT // DAILY INTELLIGENCE</span>
        <span className="landing__footer-note">YOUR WORK STAYS YOURS.</span>
        {onReplayIntro ? (
          <button className="landing__footer-button" type="button" onClick={onReplayIntro}>
            Replay intro
          </button>
        ) : null}
        <span className="landing__footer-status">
          <span className={statusClass} aria-hidden="true" />
          {status}
        </span>
      </footer>
    </div>
  );
}
