import { createAuthClient } from '@neon/auth';
import { BetterAuthReactAdapter } from '@neon/auth/react/adapters';
import type { AuthTokenProvider } from '@/lib/api/auth';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim() ?? '';

export const neonAuth = authUrl
  ? createAuthClient(authUrl, {
      adapter: BetterAuthReactAdapter({ fetchOptions: { credentials: 'include' } }),
    })
  : null;

export function createNeonTokenProvider(): AuthTokenProvider {
  return async () => {
    if (!neonAuth) return null;
    const result = await neonAuth.getSession();
    return result.data?.session?.token ?? null;
  };
}
