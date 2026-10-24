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

import { authApi } from '@/lib/api';
import { AUTH_MODE, type AuthMode } from '@/lib/api/config';
import {
  isFirebaseConfigured,
  onAuthStateChange,
  reloadCurrentUser,
  resendVerificationEmail as firebaseResendVerificationEmail,
  signInWithEmail as firebaseSignInWithEmail,
  signInWithGoogle as firebaseSignInWithGoogle,
  signOut as firebaseSignOut,
  signUpWithEmail as firebaseSignUpWithEmail,
} from './firebase';

export type SessionStatus =
  | 'loading'
  | 'anonymous'
  | 'authenticated'
  | 'blocked'
  | 'unconfigured';

export type BlockedReason = 'email_unverified' | 'not_invited' | 'error';

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
}

interface SessionContextValue {
  mode: AuthMode;
  configured: boolean;
  status: SessionStatus;
  user: SessionUser | null;
  blockedReason: BlockedReason | null;
  enterDevSession: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const DEV_SESSION_KEY = 'mrt.dev-session.v1';

const SessionContext = createContext<SessionContextValue | null>(null);

function fromFirebaseUser(user: User): SessionUser {
  return {
    id: user.uid,
    email: user.email,
    name: user.displayName ?? user.email?.split('@')[0] ?? 'Operator',
    emailVerified: user.emailVerified,
    isAdmin: false,
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
      emailVerified: true,
      isAdmin: true,
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

interface ResolvedSession {
  user: SessionUser;
  status: Extract<SessionStatus, 'authenticated' | 'blocked'>;
  blockedReason: BlockedReason | null;
}

async function resolveFirebaseSession(firebaseUser: User): Promise<ResolvedSession> {
  const base = fromFirebaseUser(firebaseUser);
  try {
    const me = await authApi.me();
    const user: SessionUser = {
      ...base,
      email: me.email ?? base.email,
      name: me.name ?? base.name,
      emailVerified: me.email_verified,
      isAdmin: me.is_admin,
    };
    if (me.allowed) {
      return { user, status: 'authenticated', blockedReason: null };
    }
    return {
      user,
      status: 'blocked',
      blockedReason: me.reason ?? (me.email_verified ? 'not_invited' : 'email_unverified'),
    };
  } catch {
    return { user: base, status: 'blocked', blockedReason: 'error' };
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
  const [blockedReason, setBlockedReason] = useState<BlockedReason | null>(null);

  const applyFirebaseSession = useCallback(async (firebaseUser: User) => {
    setStatus('loading');
    const resolved = await resolveFirebaseSession(firebaseUser);
    setUser(resolved.user);
    setStatus(resolved.status);
    setBlockedReason(resolved.blockedReason);
  }, []);

  useEffect(() => {
    if (AUTH_MODE !== 'firebase' || !isFirebaseConfigured) return;

    let active = true;
    const unsubscribe = onAuthStateChange((firebaseUser) => {
      if (!active) return;
      if (!firebaseUser) {
        setUser(null);
        setStatus('anonymous');
        setBlockedReason(null);
        return;
      }
      void applyFirebaseSession(firebaseUser);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyFirebaseSession]);

  const enterDevSession = useCallback(() => {
    if (AUTH_MODE !== 'dev') {
      throw new Error('Local sessions are only available in dev-token mode.');
    }
    const next: SessionUser = {
      id: 'local_dev',
      email: 'dev@localhost',
      name: 'Local operator',
      emailVerified: true,
      isAdmin: true,
    };
    writeDevSession(next);
    setUser(next);
    setStatus('authenticated');
    setBlockedReason(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (AUTH_MODE !== 'firebase') {
      throw new Error('Google sign-in is only available when Firebase is configured.');
    }
    const firebaseUser = await firebaseSignInWithGoogle();
    await applyFirebaseSession(firebaseUser);
  }, [applyFirebaseSession]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (AUTH_MODE !== 'firebase') {
        throw new Error('Email sign-in is only available when Firebase is configured.');
      }
      const firebaseUser = await firebaseSignInWithEmail(email, password);
      await applyFirebaseSession(firebaseUser);
    },
    [applyFirebaseSession],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      if (AUTH_MODE !== 'firebase') {
        throw new Error('Email sign-up is only available when Firebase is configured.');
      }
      const firebaseUser = await firebaseSignUpWithEmail(email, password);
      await applyFirebaseSession(firebaseUser);
    },
    [applyFirebaseSession],
  );

  const resendVerification = useCallback(async () => {
    if (AUTH_MODE !== 'firebase') return;
    await firebaseResendVerificationEmail();
  }, []);

  const refreshSession = useCallback(async () => {
    if (AUTH_MODE !== 'firebase') return;
    const firebaseUser = await reloadCurrentUser();
    if (!firebaseUser) {
      setUser(null);
      setStatus('anonymous');
      setBlockedReason(null);
      return;
    }
    await applyFirebaseSession(firebaseUser);
  }, [applyFirebaseSession]);

  const signOut = useCallback(async () => {
    setBlockedReason(null);
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
      blockedReason,
      enterDevSession,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      resendVerification,
      refreshSession,
      signOut,
    }),
    [
      status,
      user,
      blockedReason,
      enterDevSession,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      resendVerification,
      refreshSession,
      signOut,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
