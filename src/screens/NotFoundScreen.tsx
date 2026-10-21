import { Link } from 'react-router-dom';

import { Wordmark } from '@/components/Wordmark';

export function NotFoundScreen() {
  return (
    <main className="not-found">
      <Wordmark to="/" />
      <p className="eyebrow">404 / NOT FOUND</p>
      <h1>This page isn’t in the brief.</h1>
      <p>The route does not exist. Return to the landing page and start from there.</p>
      <Link className="btn btn--ink" to="/">
        Back to landing
      </Link>
    </main>
  );
}
