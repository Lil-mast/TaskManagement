import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';

import { AUTH_MODE, type AuthMode } from '@/lib/api/config';
import {
  isFirebaseConfigured,
  onAuthStateChange,
  signInWithEmail as firebaseSignInWithEmail,
  signInWithGoogle as firebaseSignInWithGoogle,
  signOut as firebaseSignOut,
  signUpWithEmail as firebaseSignUpWithEmail,
} from './firebase';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated' | 'unconfigured';

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
}

interface SessionContextValue {
  mode: AuthMode;
  configured: boolean;
  status: SessionStatus;
  user: SessionUser | null;
  enterDevSession: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const DEV_SESSION_KEY = 'mrt.dev-session.v1';

const SessionContext = createContext<SessionContextValue | null>(null);

function fromFirebaseUser(user: User): SessionUser {
  return {
    id: user.uid,
    email: user.email,
    name: user.displayName ?? user.email?.split('@')[0] ?? 'Operator',
  };
}

function readDevSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(DEV_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionUser>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      id: parsed.id ?? 'local_dev',
      email: parsed.email ?? 'dev@localhost',
      name: parsed.name ?? 'Local operator',
    };
  } catch {
    return null;
  }
}

function writeDevSession(user: SessionUser): void {
  try {
    localStorage.setItem(DEV_SESSION_KEY, JSON.stringify(user));
  } catch {
    // Private browsing can reject storage; the in-memory session still works.
  }
}

function clearDevSession(): void {
  try {
    localStorage.removeItem(DEV_SESSION_KEY);
  } catch {
    // Nothing to clean up.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() =>
    AUTH_MODE === 'dev' ? readDevSession() : null,
  );
  const [status, setStatus] = useState<SessionStatus>(() => {
    if (AUTH_MODE === 'dev') return readDevSession() ? 'authenticated' : 'anonymous';
    return isFirebaseConfigured ? 'loading' : 'unconfigured';
  });

  useEffect(() => {
    if (AUTH_MODE !== 'firebase' || !isFirebaseConfigured) return;

    return onAuthStateChange((firebaseUser) => {
      if (firebaseUser) {
        setUser(fromFirebaseUser(firebaseUser));
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('anonymous');
      }
    });
  }, []);

  const enterDevSession = useCallback(() => {
    if (AUTH_MODE !== 'dev') {
      throw new Error('Local sessions are only available in dev-token mode.');
    }
    const next: SessionUser = {
      id: 'local_dev',
      email: 'dev@localhost',
      name: 'Local operator',
    };
    writeDevSession(next);
    setUser(next);
    setStatus('authenticated');
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (AUTH_MODE !== 'firebase') {
      throw new Error('Google sign-in is only available when Firebase is configured.');
    }
    const firebaseUser = await firebaseSignInWithGoogle();
    setUser(fromFirebaseUser(firebaseUser));
    setStatus('authenticated');
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (AUTH_MODE !== 'firebase') {
      throw new Error('Email sign-in is only available when Firebase is configured.');
    }
    const firebaseUser = await firebaseSignInWithEmail(email, password);
    setUser(fromFirebaseUser(firebaseUser));
    setStatus('authenticated');
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (AUTH_MODE !== 'firebase') {
      throw new Error('Email sign-up is only available when Firebase is configured.');
    }
    const firebaseUser = await firebaseSignUpWithEmail(email, password);
    setUser(fromFirebaseUser(firebaseUser));
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    if (AUTH_MODE === 'dev') {
      clearDevSession();
      setUser(null);
      setStatus('anonymous');
      return;
    }
    await firebaseSignOut();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      mode: AUTH_MODE,
      configured: AUTH_MODE === 'dev' || isFirebaseConfigured,
      status,
      user,
      enterDevSession,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    }),
    [status, user, enterDevSession, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
