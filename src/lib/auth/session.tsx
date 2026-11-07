import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '@/lib/api';
import { AUTH_MODE, isNeonConfigured, type AuthMode } from '@/lib/api/config';
import { neonAuth } from './neon';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated' | 'blocked' | 'unconfigured';
export type BlockedReason = 'email_unverified' | 'not_invited' | 'error';
export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
}
interface SessionContextValue {
  mode: AuthMode | 'unconfigured'; configured: boolean; status: SessionStatus;
  user: SessionUser | null; blockedReason: BlockedReason | null;
  enterDevSession: () => void; signInWithGitHub: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resendVerification: () => Promise<void>; refreshSession: () => Promise<void>; signOut: () => Promise<void>;
}
const DEV_SESSION_KEY = 'mrt.dev-session.v1';
const SessionContext = createContext<SessionContextValue | null>(null);

function readDevSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(DEV_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionUser>;
    return { id: parsed.id ?? 'local_dev', email: parsed.email ?? 'dev@localhost', name: parsed.name ?? 'Local operator', emailVerified: true, isAdmin: true };
  } catch { return null; }
}
function writeDevSession(user: SessionUser) { try { localStorage.setItem(DEV_SESSION_KEY, JSON.stringify(user)); } catch { /* memory session still works */ } }
function clearDevSession() { try { localStorage.removeItem(DEV_SESSION_KEY); } catch { /* nothing to clear */ } }

export function SessionProvider({ children }: { children: ReactNode }) {
  const neonSession = neonAuth?.useSession();
  const authUser = neonSession?.data?.user;
  const [user, setUser] = useState<SessionUser | null>(() => AUTH_MODE === 'dev' ? readDevSession() : null);
  const [status, setStatus] = useState<SessionStatus>(() => AUTH_MODE === 'dev' ? (readDevSession() ? 'authenticated' : 'anonymous') : isNeonConfigured ? 'loading' : 'unconfigured');
  const [blockedReason, setBlockedReason] = useState<BlockedReason | null>(null);

  const resolveNeonSession = useCallback(async (source: NonNullable<typeof authUser>) => {
    const base: SessionUser = { id: source.id, email: source.email ?? null, name: source.name ?? source.email?.split('@')[0] ?? 'Operator', emailVerified: Boolean(source.emailVerified), isAdmin: false };
    setStatus('loading');
    try {
      const me = await authApi.me();
      const resolved = { ...base, email: me.email ?? base.email, name: me.name ?? base.name, emailVerified: me.email_verified, isAdmin: me.is_admin };
      setUser(resolved); setStatus(me.allowed ? 'authenticated' : 'blocked');
      setBlockedReason(me.allowed ? null : me.reason ?? (me.email_verified ? 'not_invited' : 'email_unverified'));
    } catch { setUser(base); setStatus('blocked'); setBlockedReason('error'); }
  }, []);

  useEffect(() => {
    if (AUTH_MODE !== 'neon') return;
    if (!authUser) { setUser(null); setStatus(neonSession?.isPending ? 'loading' : 'anonymous'); setBlockedReason(null); return; }
    void resolveNeonSession(authUser);
  }, [authUser, neonSession?.isPending, resolveNeonSession]);

  const enterDevSession = useCallback(() => {
    if (AUTH_MODE !== 'dev') throw new Error('Local sessions are only available in dev-token mode.');
    const next = { id: 'local_dev', email: 'dev@localhost', name: 'Local operator', emailVerified: true, isAdmin: true };
    writeDevSession(next); setUser(next); setStatus('authenticated'); setBlockedReason(null);
  }, []);
  const signInWithGitHub = useCallback(async () => {
    if (AUTH_MODE !== 'neon' || !neonAuth) throw new Error('GitHub sign-in requires Neon Auth configuration.');
    const result = await neonAuth.signIn.social({ provider: 'github', callbackURL: `${window.location.origin}/login` });
    if (result.error) throw result.error;
  }, []);
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!neonAuth) throw new Error('Neon Auth is not configured for this deployment.');
    const result = await neonAuth.signIn.email({ email, password });
    if (result.error) throw result.error;
    await refreshSession();
  }, []);
  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!neonAuth) throw new Error('Neon Auth is not configured for this deployment.');
    const result = await neonAuth.signUp.email({ email, password, name: email.split('@')[0] });
    if (result.error) throw result.error;
    await refreshSession();
  }, []);
  const resendVerification = useCallback(async () => { throw new Error('Use the verification email sent by Neon Auth, or check Neon Auth email delivery settings.'); }, []);
  const refreshSession = useCallback(async () => {
    if (!neonAuth) return;
    const result = await neonAuth.getSession();
    const current = result.data?.user;
    if (!current) { setUser(null); setStatus('anonymous'); setBlockedReason(null); return; }
    await resolveNeonSession(current);
  }, [resolveNeonSession]);
  const signOut = useCallback(async () => {
    setBlockedReason(null);
    if (AUTH_MODE === 'dev') clearDevSession();
    else if (neonAuth) { const result = await neonAuth.signOut(); if (result.error) throw result.error; }
    setUser(null); setStatus(AUTH_MODE === 'unconfigured' ? 'unconfigured' : 'anonymous');
  }, []);

  const value = useMemo<SessionContextValue>(() => ({ mode: AUTH_MODE, configured: AUTH_MODE === 'dev' || (AUTH_MODE === 'neon' && isNeonConfigured), status, user, blockedReason, enterDevSession, signInWithGitHub, signInWithEmail, signUpWithEmail, resendVerification, refreshSession, signOut }), [status, user, blockedReason, enterDevSession, signInWithGitHub, signInWithEmail, signUpWithEmail, resendVerification, refreshSession, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
