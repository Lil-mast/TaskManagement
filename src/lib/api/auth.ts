export interface TokenProviderOptions {
  forceRefresh?: boolean;
}

export type AuthTokenProvider = (options?: TokenProviderOptions) => Promise<string | null>;

let provider: AuthTokenProvider | null = null;

/** Injected at boot (Firebase or dev). Keeps the client testable and SDK-agnostic. */
export function setAuthTokenProvider(next: AuthTokenProvider | null): void {
  provider = next;
}

export async function getAuthToken(options?: TokenProviderOptions): Promise<string | null> {
  if (!provider) return null;
  const token = await provider(options);
  return token && token.length > 0 ? token : null;
}

/**
 * Local backend auth. Only valid when the server has no identity provider
 * configured (its `auth_mode` is `dev`).
 */
export function createDevTokenProvider(token = import.meta.env.VITE_DEV_TOKEN || 'dev'): AuthTokenProvider {
  return async () => token;
}
