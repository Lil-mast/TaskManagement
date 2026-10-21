import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { BriefIcon, CaptureIcon, TasksIcon, TrashIcon } from '@/components/icons';
import { Wordmark } from '@/components/Wordmark';
import { healthApi } from '@/lib/api';
import { useSession } from '@/lib/auth/session';
import { queryKeys } from '@/lib/query/keys';

const dateLabel = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
})
  .format(new Date())
  .toUpperCase();

function pageTitle(pathname: string): string {
  if (pathname.startsWith('/tasks')) return 'Tasks';
  if (pathname.startsWith('/trash')) return 'Trash';
  return 'Daily Brief';
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { mode, user, signOut } = useSession();

  const [signingOut, setSigningOut] = useState(false);
  const [shellError, setShellError] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);

  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => healthApi.get(signal),
    retry: false,
    staleTime: 30_000,
  });

  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  const capturePath = `/capture?return=${returnTo}`;
  const title = pageTitle(location.pathname);
  const initial = (user?.name ?? user?.email ?? 'M').slice(0, 1).toUpperCase();

  useEffect(() => {
    document.title = `${title} · MrT`;
  }, [title]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        navigate(capturePath);
      }
      if (event.key === 'Escape') setRailOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capturePath, navigate]);

  async function handleSignOut() {
    setShellError(null);
    setSigningOut(true);
    try {
      await signOut();
      queryClient.clear();
      navigate('/', { replace: true });
    } catch (caught) {
      setShellError(caught instanceof Error ? caught.message : 'Could not sign out.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="shell">
      <aside className={`shell__rail ${railOpen ? 'shell__rail--open' : ''}`} aria-label="Primary">
        <div className="shell__rail-top">
          <Wordmark to="/brief" size="sm" className="shell__logo" />
        </div>

        <nav className="shell__rail-nav" aria-label="Workspace">
          <NavLink
            to="/brief"
            end
            className={({ isActive }) => `rail-link ${isActive ? 'rail-link--active' : ''}`}
            title="Brief"
            onClick={() => setRailOpen(false)}
          >
            <BriefIcon />
            <span className="rail-link__label">Brief</span>
          </NavLink>
          <NavLink
            to="/tasks"
            className={({ isActive }) => `rail-link ${isActive ? 'rail-link--active' : ''}`}
            title="Tasks"
            onClick={() => setRailOpen(false)}
          >
            <TasksIcon />
            <span className="rail-link__label">Tasks</span>
          </NavLink>
          <NavLink
            to={capturePath}
            className={({ isActive }) => `rail-link ${isActive ? 'rail-link--active' : ''}`}
            title="Capture"
            onClick={() => setRailOpen(false)}
          >
            <CaptureIcon />
            <span className="rail-link__label">Capture</span>
          </NavLink>
          <NavLink
            to="/trash"
            className={({ isActive }) => `rail-link ${isActive ? 'rail-link--active' : ''}`}
            title="Trash"
            onClick={() => setRailOpen(false)}
          >
            <TrashIcon />
            <span className="rail-link__label">Trash</span>
          </NavLink>
        </nav>

        <div className="shell__rail-foot">
          <span className="rail-mode" title={mode === 'dev' ? 'Local dev session' : 'Firebase session'}>
            {mode === 'dev' ? 'LOCAL' : 'FIRE'}
          </span>
          <button
            className="rail-signout"
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            title="Sign out"
          >
            OUT
          </button>
        </div>
      </aside>

      {railOpen ? (
        <button
          className="shell__scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setRailOpen(false)}
        />
      ) : null}

      <div className="shell__body">
        <header className="shell__topbar">
          <button
            className="shell__menu"
            type="button"
            aria-label={railOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={railOpen}
            onClick={() => setRailOpen((open) => !open)}
          >
            <span />
            <span />
          </button>

          <div className="shell__heading">
            <span className="mono-label mono-label--muted">{title}</span>
            <span className="shell__date">{dateLabel}</span>
          </div>

          <div className="shell__top-actions">
            <button
              className="shell__capture"
              type="button"
              onClick={() => navigate(capturePath)}
            >
              <span className="shell__shortcut">⌘K</span>
              Capture
            </button>
            <span className="shell__name">{user?.name ?? user?.email}</span>
            <span className="shell__avatar" aria-hidden="true">
              {initial}
            </span>
            <button
              className="shell__signout"
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </header>

        {shellError ? (
          <p className="shell__error" role="alert">
            {shellError}
          </p>
        ) : null}

        <main className="shell__content">
          <Outlet />
        </main>

        <footer className="shell__statusbar">
          <span className="shell__status-item">
            <span
              className={`status-pip ${health.isSuccess ? '' : health.isPending ? 'status-pip--idle' : 'status-pip--bad'}`}
              aria-hidden="true"
            />
            {health.isPending ? 'SYNCING' : health.isSuccess ? 'SYNCED' : 'OFFLINE'}
          </span>
          <span className="shell__status-item">{mode === 'dev' ? 'LOCAL SESSION' : 'FIREBASE'}</span>
          <span className="shell__status-item shell__status-item--wide">⌘K CAPTURE</span>
          <span className="shell__status-item">MRT / 2026</span>
        </footer>
      </div>

      <nav className="shell__bottomnav" aria-label="Mobile navigation">
        <NavLink
          to="/brief"
          end
          className={({ isActive }) => `bottom-link ${isActive ? 'bottom-link--active' : ''}`}
        >
          <BriefIcon />
          <span>Brief</span>
        </NavLink>
        <NavLink
          to="/tasks"
          className={({ isActive }) => `bottom-link ${isActive ? 'bottom-link--active' : ''}`}
        >
          <TasksIcon />
          <span>Tasks</span>
        </NavLink>
        <NavLink to={capturePath} className="bottom-link bottom-link--capture">
          <CaptureIcon />
          <span>Capture</span>
        </NavLink>
        <NavLink
          to="/trash"
          className={({ isActive }) => `bottom-link ${isActive ? 'bottom-link--active' : ''}`}
        >
          <TrashIcon />
          <span>Trash</span>
        </NavLink>
      </nav>
    </div>
  );
}
