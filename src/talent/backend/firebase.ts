/**
 * Lazy Firebase bootstrap shared by Gemini (Firebase AI Logic) and the
 * Firestore backend. Nothing is loaded unless the VITE_FIREBASE_* variables are
 * present (see `.env.example`), so the default build stays fully local.
 */
import type { FirebaseApp, FirebaseOptions } from 'firebase/app';

const env = import.meta.env as Record<string, string | undefined>;

export const FIREBASE_CONFIG: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = () => Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);

let appPromise: Promise<FirebaseApp> | null = null;

export function getFirebaseApp(): Promise<FirebaseApp> {
  if (!isFirebaseConfigured()) return Promise.reject(new Error('Firebase is not configured. Add VITE_FIREBASE_* values (see .env.example).'));
  appPromise ??= import('firebase/app').then(({ getApps, initializeApp }) => getApps()[0] ?? initializeApp(FIREBASE_CONFIG));
  return appPromise;
}

export interface SignedInUser {
  uid: string;
  email: string;
  displayName: string | null;
}

/**
 * Production identity: Google sign-in through Firebase Auth (lazy-loaded).
 * Reuses an existing session, otherwise opens the Google account picker.
 * Access is then decided by the `members/{email}` allowlist + security rules.
 */
export async function ensureSignedIn(): Promise<SignedInUser> {
  const app = await getFirebaseApp();
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const auth = getAuth(app);
  await auth.authStateReady();
  let user = auth.currentUser;
  if (!user) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    user = (await signInWithPopup(auth, provider)).user;
  }
  if (!user.email) throw new Error('The signed-in Google account has no email address.');
  return { uid: user.uid, email: user.email.toLowerCase(), displayName: user.displayName };
}
