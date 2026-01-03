// Quick Firebase test
import { isFirebaseConfigured, app, auth } from './src/lib/firebase.js';

console.log('🔥 Firebase Configuration Test');
console.log('================================');

console.log('Firebase Configured:', isFirebaseConfigured);
console.log('Firebase App:', app ? '✅ Initialized' : '❌ Not initialized');
console.log('Firebase Auth:', auth ? '✅ Available' : '❌ Not available');

if (isFirebaseConfigured && app && auth) {
  console.log('✅ Firebase is properly configured and ready!');
  console.log('Project ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID);
  console.log('Auth Domain:', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
} else {
  console.log('❌ Firebase configuration issues detected');
  console.log('Check your .env.local file for missing Firebase variables');
}
