import { useState } from 'react';
import type { BookIdeaItem } from '@/lib/api';

interface BooksInspirationCardProps {
  inspiration: BookIdeaItem;
  alternatives: BookIdeaItem[];
  /** compact=true renders inside a brief panel — tighter, no border, no bg */
  compact?: boolean;
  isLoading?: boolean;
  isError?: boolean;
}

export function BooksInspirationCard({
  inspiration,
  alternatives,
  compact = false,
  isLoading = false,
  isError = false,
}: BooksInspirationCardProps) {
  const [idx, setIdx] = useState(0);
  const all = [inspiration, ...alternatives];
  const displayed = all[idx] ?? inspiration;
  const canShuffle = all.length > 1;

  const shuffle = () => setIdx((i) => (i + 1) % all.length);

  /* ── loading ─────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className={compact ? 'insp insp--compact insp--skeleton' : 'books-card books-card--skeleton'} aria-busy="true">
        <div className={compact ? 'insp__body' : 'books-card__content'}>
          <div className={compact ? 'insp__source' : 'books-card__eyebrow'} />
          <div className={compact ? 'insp__idea' : 'books-card__idea'} />
          <div className={compact ? 'insp__application' : 'books-card__application'} />
        </div>
      </div>
    );
  }

  /* ── error ───────────────────────────────────────────── */
  if (isError) {
    return (
      <div className={compact ? 'insp insp--compact insp--error' : 'books-card books-card--error'}>
        <p className={compact ? 'insp__error' : 'books-card__error-text'}>
          Unable to load today's inspiration.
        </p>
      </div>
    );
  }

  /* ── compact (brief panel) ───────────────────────────── */
  if (compact) {
    return (
      <div className="insp insp--compact">
        <p className="insp__source">
          {displayed.book}
          {displayed.chapter ? <span> / {displayed.chapter}</span> : null}
        </p>

        <p className="insp__idea">{displayed.idea}</p>

        {displayed.application ? (
          <p className="insp__application">{displayed.application}</p>
        ) : null}

        <div className="insp__foot">
          {displayed.tags.length > 0 && (
            <div className="insp__tags">
              {displayed.tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          )}
          {canShuffle && (
            <button className="insp__shuffle" type="button" onClick={shuffle}>
              Next idea
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── full (landing page) ─────────────────────────────── */
  return (
    <div className="books-card">
      <div className="books-card__content">
        <p className="books-card__eyebrow">
          {displayed.book}
          {displayed.chapter ? <span> / {displayed.chapter}</span> : null}
        </p>

        <h3 className="books-card__idea">{displayed.idea}</h3>

        {displayed.application ? (
          <p className="books-card__application">{displayed.application}</p>
        ) : null}

        {displayed.tags.length > 0 && (
          <div className="books-card__tags">
            {displayed.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {canShuffle && (
        <button className="books-card__shuffle" type="button" onClick={shuffle}>
          Next idea
        </button>
      )}
    </div>
  );
}
