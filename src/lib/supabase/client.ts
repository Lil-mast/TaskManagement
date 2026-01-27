/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SUPABASE_SERVICE_ROLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Debug logging
console.log('Supabase URL:', supabaseUrl);
console.log('Service Key present:', !!supabaseServiceKey);
console.log('Service Key length:', supabaseServiceKey.length);
console.log('Anon Key present:', !!supabaseAnonKey);

// Use service role if available, otherwise fallback to anon key
const supabaseKey = supabaseServiceKey || supabaseAnonKey;

// Validate environment variables before creating client
if (!supabaseUrl) {
  console.error('Supabase URL is not configured. Please set VITE_SUPABASE_URL in your environment variables.');
}

if (!supabaseKey) {
  console.error('Supabase key is not configured. Please set VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_SERVICE_ROLE_KEY in your environment variables.');
}

// Use service role for database operations (bypasses RLS for Firebase auth)
export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
}) : null;

// Database functions
export const getTasks = async (userId: string) => {
  if (!supabase) {
    return { data: [], error: new Error('Supabase not configured') };
  }
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  return { data, error };
};

export const addTask = async (task: { title: string; description?: string; quadrant: string; user_id: string }) => {
  if (!supabase) {
    return { data: null, error: new Error('Supabase not configured') };
  }
  const { data, error } = await supabase
    .from('tasks')
    .insert([task])
    .select();
    
  return { data, error };
};

export const updateTask = async (id: string, updates: any) => {
  if (!supabase) {
    return { data: null, error: new Error('Supabase not configured') };
  }
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select();
    
  return { data, error };
};

export const deleteTask = async (id: string) => {
  if (!supabase) {
    return { error: new Error('Supabase not configured') };
  }
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);
    
  return { error };
};
