import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = supabaseUrl && supabaseAnonKey;

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
}) : null;

// Auth functions
export const signInWithGoogle = async () => {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });
  return { data, error };
};

export const signOut = async () => {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  if (!supabase) {
    return { user: null, error: null };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
};

// Database functions
export const getTasks = async (userId: string) => {
  if (!supabase) {
    return { data: [], error: null };
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
    // Return a mock task for local mode
    const mockTask = {
      id: Date.now().toString(),
      ...task,
      created_at: new Date().toISOString()
    };
    return { data: [mockTask], error: null };
  }
  const { data, error } = await supabase
    .from('tasks')
    .insert([task])
    .select();
    
  return { data, error };
};

export const updateTask = async (id: string, updates: any) => {
  if (!supabase) {
    return { data: null, error: null };
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
    return { error: null };
  }
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);
    
  return { error };
};
