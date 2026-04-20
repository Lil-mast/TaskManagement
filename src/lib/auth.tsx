import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOut as firebaseSignOut,
  onAuthStateChange,
  isFirebaseConfigured,
  signInWithPhone,
  confirmPhoneCode,
  setupRecaptcha
} from './firebase';
import { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import { supabase, isSupabaseConfigured } from './supabase';

interface AuthContextType {
  user: User | null;
  session: any;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  signInWithPhone: (phoneNumber: string, appVerifier: RecaptchaVerifier) => Promise<ConfirmationResult>;
  confirmPhoneCode: (confirmationResult: ConfirmationResult, code: string) => Promise<void>;
  setupRecaptcha: (containerId: string) => RecaptchaVerifier;
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
          // Use Firebase UID directly for database operations
          const supabaseUser: User = {
            id: firebaseUser.uid, // Use Firebase UID directly
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
      throw new Error(
        'Firebase authentication is not configured. ' +
        'Please ensure VITE_FIREBASE_* environment variables are set in your .env file ' +
        'and the app has been rebuilt after adding them.'
      );
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

  const signInWithPhoneAuth = async (phoneNumber: string, appVerifier: RecaptchaVerifier): Promise<ConfirmationResult> => {
    if (!isFirebaseConfigured) {
      throw new Error('Phone authentication not available in local mode');
    }
    return await signInWithPhone(phoneNumber, appVerifier);
  };

  const confirmPhoneCodeAuth = async (confirmationResult: ConfirmationResult, code: string) => {
    if (!isFirebaseConfigured) {
      throw new Error('Phone authentication not available in local mode');
    }
    await confirmPhoneCode(confirmationResult, code);
    // Auth state change will handle setting the user
  };

  const setupRecaptchaAuth = (containerId: string): RecaptchaVerifier => {
    if (!isFirebaseConfigured) {
      throw new Error('Phone authentication not available in local mode');
    }
    return setupRecaptcha(containerId);
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signInWithGoogle: signInWithGoogleAuth,
    signOutUser,
    signInWithPhone: signInWithPhoneAuth,
    confirmPhoneCode: confirmPhoneCodeAuth,
    setupRecaptcha: setupRecaptchaAuth,
    isSupabaseMode: isSupabaseConfigured,
    isFirebaseMode: isFirebaseConfigured,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};