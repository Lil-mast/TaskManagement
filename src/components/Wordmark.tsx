import { Link } from 'react-router-dom';

type WordmarkSize = 'sm' | 'md' | 'hero';

interface WordmarkProps {
  to?: string;
  size?: WordmarkSize;
  className?: string;
}

export function Wordmark({ to, size = 'md', className = '' }: WordmarkProps) {
  const content = (
    <span className="wordmark__lockup">
      Mr<span className="wordmark__t">T</span>
    </span>
  );

  const classes = `wordmark wordmark--${size} ${className}`.trim();

  if (to) {
    return (
      <Link to={to} className={classes} aria-label="MrT home">
        {content}
      </Link>
    );
  }

  return <span className={classes}>{content}</span>;
}
