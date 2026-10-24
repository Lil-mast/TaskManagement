import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth';

import type { AuthTokenProvider } from '@/lib/api/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => value.trim().length > 0,
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

if (isFirebaseConfigured) {
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  auth = getAuth(app);
}

export { auth };

export function createFirebaseTokenProvider(): AuthTokenProvider {
  return async ({ forceRefresh = false } = {}) => {
    if (!auth?.currentUser) return null;
    return auth.currentUser.getIdToken(forceRefresh);
  };
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error('Firebase is not configured for this deployment.');
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  if (!auth) throw new Error('Firebase is not configured for this deployment.');
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  if (!auth) throw new Error('Firebase is not configured for this deployment.');
  const result = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await sendEmailVerification(result.user);
  } catch {
    // The account exists; the blocked-account panel offers a resend.
  }
  return result.user;
}

export async function resendVerificationEmail(): Promise<void> {
  if (!auth?.currentUser) throw new Error('Sign in again before requesting another email.');
  if (auth.currentUser.emailVerified) return;
  await sendEmailVerification(auth.currentUser);
}

/** Re-read the Firebase profile so a just-verified email becomes visible. */
export async function reloadCurrentUser(): Promise<User | null> {
  if (!auth?.currentUser) return null;
  await reload(auth.currentUser);
  await auth.currentUser.getIdToken(true);
  return auth.currentUser;
}

export async function signOut(): Promise<void> {
  if (auth) await firebaseSignOut(auth);
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, callback);
}
