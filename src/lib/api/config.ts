function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();

/** Backend origin. Never includes a trailing slash. */
export const API_BASE_URL = withoutTrailingSlash(
  configuredBase && configuredBase.length > 0 ? configuredBase : 'http://localhost:8000',
);

export type AuthMode = 'dev' | 'firebase';

const firebaseEnvConfigured = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
].every((key) => String(import.meta.env[key] ?? '').trim().length > 0);

const explicitAuthMode = import.meta.env.VITE_AUTH_MODE;

export const AUTH_MODE: AuthMode =
  explicitAuthMode === 'dev' || explicitAuthMode === 'firebase'
    ? explicitAuthMode
    : firebaseEnvConfigured
      ? 'firebase'
      : import.meta.env.DEV
        ? 'dev'
        : 'firebase';

/** Per-endpoint budgets. LLM-backed calls get room; ordinary reads stay tight. */
export const TIMEOUTS = {
  default: 15_000,
  sync: 30_000,
  agent: 60_000,
} as const;
