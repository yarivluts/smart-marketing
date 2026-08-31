import 'client-only';
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let emulatorConnected = false;

function getFirebaseApp(): FirebaseApp {
  if (app) {
    return app;
  }
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }
  app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDJ7U_VLfSzEsiUUI3mUts_UBkBBKjJa8k',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'growthos-g2w84.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'growthos-g2w84',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:1098891924957:web:2e4ee0bc9b9b79e804d234',
  });
  return app;
}

/**
 * Lazily creates (and memoizes) the client-side Firebase Auth instance. The
 * `client-only` import above makes accidentally importing this from a Server
 * Component a build-time error, since the module-scope singletons below
 * would otherwise be shared across unrelated requests in a warm server
 * instance.
 */
export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
  if (emulatorHost && !emulatorConnected) {
    connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
    emulatorConnected = true;
  }
  return auth;
}
