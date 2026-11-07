import { createClient } from '@supabase/supabase-js';

import type { AuthTokenProvider } from '@/lib/api/auth';
import { isSupabaseConfigured } from '@/lib/api/config';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;

export function createSupabaseTokenProvider(): AuthTokenProvider {
  return async ({ forceRefresh = false } = {}) => {
    if (!supabase) return null;
    if (forceRefresh) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      return data.session?.access_token ?? null;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  };
}
