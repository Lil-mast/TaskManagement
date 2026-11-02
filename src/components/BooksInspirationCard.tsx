import { useState } from 'react';
import type { BookIdeaItem } from '@/lib/api';

interface BooksInspirationCardProps {
  inspiration: BookIdeaItem;
  alternatives: BookIdeaItem[];
  isLoading?: boolean;
  isError?: boolean;
}

export function BooksInspirationCard({
  inspiration,
  alternatives,
  isLoading = false,
  isError = false,
}: BooksInspirationCardProps) {
  const [displayedIdea, setDisplayedIdea] = useState(inspiration);
  const allIdeas = [inspiration, ...alternatives];

  const handleShuffle = () => {
    const currentIndex = allIdeas.findIndex(
      (idea) =>
        idea.book === displayedIdea.book &&
        idea.idea === displayedIdea.idea &&
        idea.chapter === displayedIdea.chapter,
    );
    const nextIndex = (currentIndex + 1) % allIdeas.length;
    setDisplayedIdea(allIdeas[nextIndex]);
  };

  if (isLoading) {
    return (
      <div className="books-card books-card--skeleton" aria-busy="true">
        <div className="books-card__content">
          <div className="books-card__eyebrow" />
          <div className="books-card__idea" />
          <div className="books-card__application" />
          <div className="books-card__tags">
            <span className="tag" />
            <span className="tag" />
          </div>
        </div>
        <button className="books-card__shuffle" disabled>
          Shuffle
        </button>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="books-card books-card--error">
        <p className="books-card__error-text">Unable to load daily inspiration</p>
      </div>
    );
  }

  return (
    <div className="books-card">
      <div className="books-card__content">
        <p className="books-card__eyebrow">
          {displayedIdea.book}
          {displayedIdea.chapter && <span> / {displayedIdea.chapter}</span>}
        </p>

        <h3 className="books-card__idea">{displayedIdea.idea}</h3>

        {displayedIdea.application && (
          <p className="books-card__application">{displayedIdea.application}</p>
        )}

        {displayedIdea.tags && displayedIdea.tags.length > 0 && (
          <div className="books-card__tags">
            {displayedIdea.tags.map((tag, idx) => (
              <span key={idx} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {allIdeas.length > 1 && (
        <button
          className="books-card__shuffle"
          onClick={handleShuffle}
          type="button"
          title="Load next alternative"
        >
          Shuffle
        </button>
      )}
    </div>
  );
}
