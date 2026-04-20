import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  RecaptchaVerifier,
  ConfirmationResult
} from 'firebase/auth';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(value => value !== '');

// Debug logging in development
if (import.meta.env.DEV) {
  console.log('Firebase Config Check:', {
    apiKey: firebaseConfig.apiKey ? 'Set' : 'Missing',
    authDomain: firebaseConfig.authDomain ? 'Set' : 'Missing',
    projectId: firebaseConfig.projectId ? 'Set' : 'Missing',
    storageBucket: firebaseConfig.storageBucket ? 'Set' : 'Missing',
    messagingSenderId: firebaseConfig.messagingSenderId ? 'Set' : 'Missing',
    appId: firebaseConfig.appId ? 'Set' : 'Missing',
    isConfigured: isFirebaseConfigured
  });
}

// Initialize Firebase
export const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = auth ? new GoogleAuthProvider() : null;

// Firebase auth functions
export const signInWithEmail = async (email: string, password: string) => {
  if (!auth) throw new Error('Firebase not configured');
  return await signInWithEmailAndPassword(auth, email, password);
};

export const signUpWithEmail = async (email: string, password: string) => {
  if (!auth) throw new Error('Firebase not configured');
  return await createUserWithEmailAndPassword(auth, email, password);
};

export const signInWithGoogle = async () => {
  if (!auth || !googleProvider) throw new Error('Firebase not configured');
  return await signInWithPopup(auth, googleProvider);
};

export const signOut = async () => {
  if (!auth) throw new Error('Firebase not configured');
  return await firebaseSignOut(auth);
};

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};

// Phone auth functions
export const signInWithPhone = async (phoneNumber: string, appVerifier: RecaptchaVerifier): Promise<ConfirmationResult> => {
  if (!auth) throw new Error('Firebase not configured');
  return await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
};

export const confirmPhoneCode = async (confirmationResult: ConfirmationResult, code: string) => {
  if (!confirmationResult) throw new Error('No confirmation result available');
  return await confirmationResult.confirm(code);
};

export const setupRecaptcha = (containerId: string): RecaptchaVerifier => {
  if (!auth) throw new Error('Firebase not configured');
  return new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {},
    'expired-callback': () => {}
  });
};
