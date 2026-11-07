import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Wordmark } from '@/components/Wordmark';
import { useSession } from '@/lib/auth/session';

function authErrorCopy(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'GitHub sign-in was cancelled. No changes were made.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the GitHub sign-in window. Allow popups for this site and try again.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in window is already open. Finish that one or close it first.';
    case 'auth/network-request-failed':
      return "Couldn't reach the auth service. Check your connection and try again.";
    case 'auth/invalid-email':
      return "That email address doesn't look right.";
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return "Email or password doesn't match. Try again.";
    case 'auth/email-already-in-use':
      return 'That email already has an account. Sign in instead.';
    case 'auth/weak-password':
      return 'Use at least 8 characters for your password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment, then try again.';
    case 'auth/operation-not-allowed':
      return "That sign-in method isn't enabled in Neon Auth.";
    case 'auth/account-exists-with-different-credential':
      return 'That email is already linked to another sign-in method.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : 'Sign-in failed. Try again.';
  }
}

export function LoginScreen() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'signup' ? 'signup' : 'signin';
  const isSignup = mode === 'signup';

  const {
    blockedReason,
    configured,
    mode: authMode,
    enterDevSession,
    refreshSession,
    resendVerification,
    signInWithGitHub,
    signInWithEmail,
    signOut,
    signUpWithEmail,
    status,
    user,
  } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: 'signin' | 'signup') {
    setError(null);
    setNotice(null);
    if (next === 'signup') setParams({ mode: 'signup' });
    else setParams({});
  }

  async function handleGitHub() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGitHub();
    } catch (caught) {
      setError(authErrorCopy(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setBusy(true);
    try {
      if (isSignup) await signUpWithEmail(email.trim(), password);
      else await signInWithEmail(email.trim(), password);
    } catch (caught) {
      setError(authErrorCopy(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await resendVerification();
      setNotice('Verification email sent. Check your inbox, then come back here.');
    } catch (caught) {
      setError(authErrorCopy(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await refreshSession();
    } catch (caught) {
      setError(authErrorCopy(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await signOut();
    } catch (caught) {
      setError(authErrorCopy(caught));
    } finally {
      setBusy(false);
    }
  }

  const devMode = authMode === 'dev';
  const blocked = status === 'blocked';

  return (
    <div className="auth">
      <header className="auth__header">
        <Wordmark to="/" />
        <Link className="auth__back" to="/">
          Back to landing
        </Link>
      </header>

      <main className="auth__layout">
        <aside className="auth__aside">
          <p className="eyebrow">
            <span className="eyebrow__pip" aria-hidden="true" />
            MRT // ACCESS
          </p>
          <h1>
            Pick up
            <br />
            where you left off.
          </h1>
          <p className="auth__aside-copy">
            The brief waits for you. So does the decision about what actually moves today.
          </p>
          <div className="auth__aside-rule" aria-hidden="true" />
          <p className="auth__quote">“The tool proposes. The operator decides.”</p>
        </aside>

        <section className="auth__panel" aria-label={isSignup ? 'Create account' : 'Sign in'}>
          <div className="auth__panel-head">
            <p className="eyebrow">
              {blocked ? 'ACCESS CHECK' : isSignup ? 'NEW OPERATOR' : 'WELCOME BACK'}
            </p>
            <h2>
              {blocked
                ? 'One more step.'
                : isSignup
                  ? 'Create your workspace.'
                  : 'Sign in to your workspace.'}
            </h2>
          </div>

          {!configured ? (
            <div className="auth__notice" role="alert">
              <p className="eyebrow">NEON AUTH NOT CONFIGURED</p>
              <h3>Sign-in is not available in this build.</h3>
              <p>
                Set <code>VITE_AUTH_MODE=neon</code> and <code>VITE_NEON_AUTH_URL</code>, then rebuild. In local development, use the
                dev-token session instead.
              </p>
              <Link className="btn btn--ghost" to="/">
                Back to landing
              </Link>
            </div>
          ) : blocked ? (
            <div className="auth__notice" role="alert">
              <p className="eyebrow">
                {blockedReason === 'email_unverified'
                  ? 'EMAIL NOT VERIFIED'
                  : blockedReason === 'not_invited'
                    ? 'INVITE ONLY'
                    : 'ACCESS CHECK FAILED'}
              </p>
              <h3>
                {blockedReason === 'email_unverified'
                  ? 'Verify your email to continue.'
                  : blockedReason === 'not_invited'
                    ? "This account isn't on the invite list."
                    : "Couldn't verify workspace access."}
              </h3>
              <p>
                {blockedReason === 'email_unverified'
                  ? `We sent a verification link to ${user?.email ?? 'your email'}. Open it, then check again.`
                  : blockedReason === 'not_invited'
                    ? 'MrT is invite-only. Ask the admin to add this email, then sign in again.'
                    : 'The API could not confirm your account. Check the backend auth configuration and connection, then try again.'}
              </p>
              {notice ? (
                <p className="auth__hint" role="status">
                  {notice}
                </p>
              ) : null}
              {error ? (
                <p className="auth__error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="auth__actions">
                {blockedReason === 'email_unverified' ? (
                  <button
                    className="btn btn--ink"
                    type="button"
                    onClick={() => void handleResend()}
                    disabled={busy}
                  >
                    {busy ? 'Sending…' : 'Resend verification'}
                  </button>
                ) : null}
                {blockedReason !== 'not_invited' ? (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => void handleRefresh()}
                    disabled={busy}
                  >
                    {busy
                      ? 'Checking…'
                      : blockedReason === 'email_unverified'
                        ? "I've verified — check again"
                        : 'Try again'}
                  </button>
                ) : null}
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={busy}
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : devMode ? (
            <div className="auth__dev">
              <div className="auth__dev-head">
                <span className="tag tag--crimson">LOCAL</span>
                <span className="mono-label">NO IDENTITY PROVIDER</span>
              </div>
              <h3>This build is using the backend's dev token.</h3>
              <p>
                Neon Auth is not configured, so sign-in and sign-up are simulated locally. You
                can review the full route without creating an account.
              </p>
              <button
                className="btn btn--ink auth__submit"
                type="button"
                onClick={() => {
                  setError(null);
                  enterDevSession();
                }}
              >
                Enter local workspace
              </button>
              <p className="auth__hint">
                To enable real accounts, set <code>VITE_AUTH_MODE=neon</code> and{' '}
                <code>VITE_NEON_AUTH_URL</code> in <code>.env.local</code>.
              </p>
            </div>
          ) : (
            <>
              <div className="auth__tabs" role="tablist" aria-label="Authentication mode">
                <button
                  className={`auth__tab ${!isSignup ? 'auth__tab--active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={!isSignup}
                  onClick={() => switchMode('signin')}
                >
                  Sign in
                </button>
                <button
                  className={`auth__tab ${isSignup ? 'auth__tab--active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={isSignup}
                  onClick={() => switchMode('signup')}
                >
                  Create account
                </button>
              </div>

              <button
                className="btn btn--ghost auth__github"
                type="button"
                onClick={() => void handleGitHub()}
                disabled={busy}
              >
                <svg className="auth__github-mark" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.807 1.305 3.492.998.108-.775.418-1.305.762-1.605-2.665-.3-5.466-1.333-5.466-5.93 0-1.31.468-2.38 1.235-3.22-.123-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.12 3.176.77.84 1.233 1.91 1.233 3.22 0 4.61-2.805 5.626-5.475 5.92.43.372.814 1.102.814 2.222 0 1.606-.015 2.9-.015 3.293 0 .322.216.694.825.576C20.565 21.796 24 17.297 24 12 24 5.37 18.627 0 12 0z" />
                </svg>
                Continue with GitHub
              </button>

              <div className="auth__divider">
                <span>OR</span>
              </div>

              <form className="auth__form" onSubmit={(event) => void handleSubmit(event)}>
                <label className="field">
                  <span className="field__label">Email</span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={busy}
                    required
                  />
                </label>

                <label className="field">
                  <span className="field__label">Password</span>
                  <input
                    type="password"
                    name="password"
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={isSignup ? 8 : undefined}
                    disabled={busy}
                    required
                  />
                </label>

                {error ? (
                  <p className="auth__error" role="alert">
                    {error}
                  </p>
                ) : null}

                <button className="btn btn--ink auth__submit" type="submit" disabled={busy}>
                  {busy ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}
                </button>
              </form>

              {isSignup ? (
                <p className="auth__hint">
                  Accounts are invite-only. Use the email the admin invited; you will need to
                  verify it before entering.
                </p>
              ) : null}

              <p className="auth__legal">
                By continuing, you agree to the workspace rule: MrT proposes, and you decide.
              </p>
            </>
          )}
        </section>
      </main>

      <footer className="auth__footer">
        <span>MRT // DAILY INTELLIGENCE</span>
        <span>SECURE SESSION · NO AUTONOMOUS WRITES</span>
      </footer>
    </div>
  );
}
