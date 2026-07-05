import 'server-only';
import { cert, getApps, initializeApp, type App, type AppOptions } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

const EMULATOR_PROJECT_ID = 'demo-growthos-test';

let adminApp: App | undefined;

function getAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }
  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID ?? EMULATOR_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  const options: AppOptions = { projectId };
  // Real credentials are only required against a real Firebase project
  // (pending KAN-18); against the Auth emulator (FIREBASE_AUTH_EMULATOR_HOST)
  // the Admin SDK accepts unauthenticated requests for the given project id.
  if (clientEmail && privateKey) {
    options.credential = cert({ projectId, clientEmail, privateKey });
  }

  adminApp = initializeApp(options);
  return adminApp;
}

/** Lazily creates (and memoizes) the server-side Firebase Admin Auth instance. */
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
