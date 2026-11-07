function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();

/** Backend origin. Never includes a trailing slash. */
export const API_BASE_URL = withoutTrailingSlash(
  configuredBase && configuredBase.length > 0 ? configuredBase : 'http://localhost:8000',
);

export type AuthMode = 'dev' | 'supabase';

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
);

const explicitAuthMode = import.meta.env.VITE_AUTH_MODE;

export const AUTH_MODE: AuthMode | 'unconfigured' =
  explicitAuthMode === 'dev' || explicitAuthMode === 'supabase'
    ? explicitAuthMode
    : isSupabaseConfigured
      ? 'supabase'
      : import.meta.env.DEV
        ? 'dev'
        : 'unconfigured';

/** Per-endpoint budgets. LLM-backed calls get room; ordinary reads stay tight. */
export const TIMEOUTS = {
  default: 15_000,
  sync: 30_000,
  agent: 60_000,
} as const;
