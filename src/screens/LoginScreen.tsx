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
      return 'Google sign-in was cancelled. No changes were made.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google popup. Allow popups for this site and try again.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in window is already open. Finish that one or close it first.';
    case 'auth/network-request-failed':
      return "Couldn't reach Firebase. Check your connection and try again.";
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
      return "That sign-in method isn't enabled in Firebase.";
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
    configured,
    mode: authMode,
    enterDevSession,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
  } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: 'signin' | 'signup') {
    setError(null);
    if (next === 'signup') setParams({ mode: 'signup' });
    else setParams({});
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
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

  const devMode = authMode === 'dev';

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
            <p className="eyebrow">{isSignup ? 'NEW OPERATOR' : 'WELCOME BACK'}</p>
            <h2>{isSignup ? 'Create your workspace.' : 'Sign in to your workspace.'}</h2>
          </div>

          {!configured ? (
            <div className="auth__notice" role="alert">
              <p className="eyebrow">FIREBASE NOT CONFIGURED</p>
              <h3>Sign-in is not available in this build.</h3>
              <p>
                Set <code>VITE_AUTH_MODE=firebase</code> and the <code>VITE_FIREBASE_*</code>{' '}
                values, then rebuild. In local development, use the dev-token session instead.
              </p>
              <Link className="btn btn--ghost" to="/">
                Back to landing
              </Link>
            </div>
          ) : devMode ? (
            <div className="auth__dev">
              <div className="auth__dev-head">
                <span className="tag tag--crimson">LOCAL</span>
                <span className="mono-label">NO IDENTITY PROVIDER</span>
              </div>
              <h3>This build is using the backend's dev token.</h3>
              <p>
                Firebase is not configured, so sign-in and sign-up are simulated locally. You
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
                To enable real accounts, set <code>VITE_AUTH_MODE=firebase</code> and the{' '}
                <code>VITE_FIREBASE_*</code> values in <code>.env.local</code>.
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
                className="btn btn--ghost auth__google"
                type="button"
                onClick={() => void handleGoogle()}
                disabled={busy}
              >
                <span className="auth__google-mark" aria-hidden="true">
                  G
                </span>
                Continue with Google
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
