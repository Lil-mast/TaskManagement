/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AUTH_MODE?: 'dev' | 'neon';
  readonly VITE_DEV_TOKEN?: string;
  readonly VITE_NEON_AUTH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
