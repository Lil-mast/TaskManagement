import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';

import { authApi } from '@/lib/api';
import { AUTH_MODE, isSupabaseConfigured, type AuthMode } from '@/lib/api/config';
import { supabase } from './supabase';

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
  mode: AuthMode | 'unconfigured';
  configured: boolean;
  status: SessionStatus;
  user: SessionUser | null;
  blockedReason: BlockedReason | null;
  enterDevSession: () => void;
  signInWithGitHub: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const DEV_SESSION_KEY = 'mrt.dev-session.v1';
const SessionContext = createContext<SessionContextValue | null>(null);

function fromSupabaseUser(user: User): SessionUser {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  return {
    id: user.id,
    email: user.email ?? null,
    name: typeof metadataName === 'string' ? metadataName : user.email?.split('@')[0] ?? 'Operator',
    emailVerified: Boolean(user.email_confirmed_at),
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
    // The in-memory session still works when browser storage is unavailable.
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

async function resolveSupabaseSession(authUser: User): Promise<ResolvedSession> {
  const base = fromSupabaseUser(authUser);
  try {
    const me = await authApi.me();
    const user: SessionUser = {
      ...base,
      email: me.email ?? base.email,
      name: me.name ?? base.name,
      emailVerified: me.email_verified,
      isAdmin: me.is_admin,
    };
    if (me.allowed) return { user, status: 'authenticated', blockedReason: null };
    return {
      user,
      status: 'blocked',
      blockedReason: me.reason ?? (me.email_verified ? 'not_invited' : 'email_unverified'),
    };
  } catch {
    return { user: base, status: 'blocked', blockedReason: 'error' };
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase Auth is not configured for this deployment.');
  return supabase;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() =>
    AUTH_MODE === 'dev' ? readDevSession() : null,
  );
  const [status, setStatus] = useState<SessionStatus>(() => {
    if (AUTH_MODE === 'dev') return readDevSession() ? 'authenticated' : 'anonymous';
    return isSupabaseConfigured ? 'loading' : 'unconfigured';
  });
  const [blockedReason, setBlockedReason] = useState<BlockedReason | null>(null);

  const applySupabaseSession = useCallback(async (authUser: User) => {
    setStatus('loading');
    const resolved = await resolveSupabaseSession(authUser);
    setUser(resolved.user);
    setStatus(resolved.status);
    setBlockedReason(resolved.blockedReason);
  }, []);

  useEffect(() => {
    if (AUTH_MODE !== 'supabase' || !supabase) return;
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session?.user) {
        setUser(null);
        setStatus('anonymous');
        setBlockedReason(null);
        return;
      }
      // Defer network work so it does not run inside Supabase's auth callback lock.
      window.setTimeout(() => {
        if (active) void applySupabaseSession(session.user);
      }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [applySupabaseSession]);

  const enterDevSession = useCallback(() => {
    if (AUTH_MODE !== 'dev') throw new Error('Local sessions are only available in dev-token mode.');
    const next: SessionUser = {
      id: 'local_dev', email: 'dev@localhost', name: 'Local operator',
      emailVerified: true, isAdmin: true,
    };
    writeDevSession(next);
    setUser(next);
    setStatus('authenticated');
    setBlockedReason(null);
  }, []);

  const signInWithGitHub = useCallback(async () => {
    if (AUTH_MODE !== 'supabase') throw new Error('GitHub sign-in requires Supabase Auth configuration.');
    const { error } = await requireSupabase().auth.signInWithOAuth({
      provider: 'github',
      options: { scopes: 'user:email', redirectTo: `${window.location.origin}/login` },
    });
    if (error) throw error;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (AUTH_MODE !== 'supabase') throw new Error('Email sign-in requires Supabase Auth configuration.');
    const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await applySupabaseSession(data.user);
  }, [applySupabaseSession]);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (AUTH_MODE !== 'supabase') throw new Error('Email sign-up requires Supabase Auth configuration.');
    const { data, error } = await requireSupabase().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) throw error;
    if (data.user && data.session) await applySupabaseSession(data.user);
  }, [applySupabaseSession]);

  const resendVerification = useCallback(async () => {
    const current = user?.email;
    if (!current) throw new Error('Sign in again before requesting another email.');
    const { error } = await requireSupabase().auth.resend({ type: 'signup', email: current });
    if (error) throw error;
  }, [user?.email]);

  const refreshSession = useCallback(async () => {
    const { data, error } = await requireSupabase().auth.getUser();
    if (error) throw error;
    if (!data.user) {
      setUser(null);
      setStatus('anonymous');
      setBlockedReason(null);
      return;
    }
    await applySupabaseSession(data.user);
  }, [applySupabaseSession]);

  const signOut = useCallback(async () => {
    setBlockedReason(null);
    if (AUTH_MODE === 'dev') {
      clearDevSession();
    } else if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    setUser(null);
    setStatus(AUTH_MODE === 'unconfigured' ? 'unconfigured' : 'anonymous');
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    mode: AUTH_MODE,
    configured: AUTH_MODE === 'dev' || (AUTH_MODE === 'supabase' && isSupabaseConfigured),
    status, user, blockedReason, enterDevSession, signInWithGitHub, signInWithEmail,
    signUpWithEmail, resendVerification, refreshSession, signOut,
  }), [status, user, blockedReason, enterDevSession, signInWithGitHub, signInWithEmail,
    signUpWithEmail, resendVerification, refreshSession, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
