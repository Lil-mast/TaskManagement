import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, signInWithGoogle } from './supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  isSupabaseMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Local mode - no auth required
      setUser({ id: 'local-user' } as User); // Mock user for local mode
      setSession(null);
      setLoading(false);
      return;
    }

    // Supabase mode
    supabase!.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase!.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      // In local mode, simulate successful sign in
      const mockUser = {
        id: 'local-user',
        email,
        user_metadata: {},
        app_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as User;
      setUser(mockUser);
      setSession(null);
      return;
    }
    const { error } = await supabase!.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      // In local mode, simulate successful sign up
      const mockUser = {
        id: 'local-user',
        email,
        user_metadata: {},
        app_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as User;
      setUser(mockUser);
      setSession(null);
      return;
    }
    const { error } = await supabase!.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
  };

  const signInWithGoogleAuth = async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Google authentication not available in local mode');
    }
    const { error } = await signInWithGoogle();
    if (error) throw error;
  };

  const signOutUser = async () => {
    if (!isSupabaseConfigured) {
      // In local mode, just clear the mock user
      setUser(null);
      setSession(null);
      return;
    }
    const { error } = await supabase!.auth.signOut();
    if (error) throw error;
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signInWithGoogle: signInWithGoogleAuth,
    signOutUser,
    isSupabaseMode: isSupabaseConfigured,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};