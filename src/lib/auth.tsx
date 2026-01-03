import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { 
  signInWithEmail, 
  signUpWithEmail, 
  signInWithGoogle, 
  signOut as firebaseSignOut,
  onAuthStateChange,
  isFirebaseConfigured 
} from './firebase';
import { supabase, isSupabaseConfigured } from './supabase';

interface AuthContextType {
  user: User | null;
  session: any;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  isSupabaseMode: boolean;
  isFirebaseMode: boolean;
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
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured && !isSupabaseConfigured) {
      // Local mode - no auth required
      setUser({ id: 'local-user' } as User);
      setSession(null);
      setLoading(false);
      return;
    }

    if (isFirebaseConfigured) {
      // Firebase mode
      const unsubscribe = onAuthStateChange((firebaseUser) => {
        if (firebaseUser) {
          // Convert Firebase user to Supabase User format
          const supabaseUser: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email,
            aud: 'authenticated',
            created_at: firebaseUser.metadata.creationTime || new Date().toISOString(),
            user_metadata: {
              name: firebaseUser.displayName,
              photo_url: firebaseUser.photoURL
            },
            app_metadata: {},
            phone: firebaseUser.phoneNumber
          } as User;
          setUser(supabaseUser);
          setSession({ user: supabaseUser });
        } else {
          setUser(null);
          setSession(null);
        }
        setLoading(false);
      });

      return unsubscribe;
    } else {
      // Fallback to local mode
      setUser({ id: 'local-user' } as User);
      setSession(null);
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    if (isFirebaseConfigured) {
      const result = await signInWithEmail(email, password);
      // Auth state change will handle setting the user
    } else {
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
    }
  };

  const signUp = async (email: string, password: string) => {
    if (isFirebaseConfigured) {
      const result = await signUpWithEmail(email, password);
      // Auth state change will handle setting the user
    } else {
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
    }
  };

  const signInWithGoogleAuth = async () => {
    if (!isFirebaseConfigured) {
      throw new Error('Google authentication not available in local mode');
    }
    const result = await signInWithGoogle();
    // Auth state change will handle setting the user
  };

  const signOutUser = async () => {
    if (isFirebaseConfigured) {
      await firebaseSignOut();
    } else {
      // In local mode, just clear the mock user
      setUser(null);
      setSession(null);
    }
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
    isFirebaseMode: isFirebaseConfigured,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};