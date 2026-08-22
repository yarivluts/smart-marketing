'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /**
   * True for the span of a sign-in/sign-up call during which the Firebase
   * client has already updated its auth state (so `user`/`loading` look
   * settled) but the server-side session cookie hasn't been confirmed yet —
   * `onAuthStateChanged` fires as soon as `signInWithEmailAndPassword`/etc.
   * resolve, independently of and before `establishSessionOrRollBack`'s own
   * cookie round-trip finishes. A consumer that fetches session-gated data
   * (like `OrgProvider`) as soon as `loading` goes false can race ahead of
   * the cookie and see an unauthenticated response. Gate on this too.
   */
  sessionSyncing: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  /**
   * Exchanges a Firebase custom token (`Admin.auth().createCustomToken(uid)`)
   * for a real session — the passwordless-account / support-impersonation
   * path (`/login/token`). A custom token can only ever be minted by
   * someone holding this project's Admin SDK service-account credentials;
   * no client can forge one, so this adds no new attack surface beyond what
   * Admin SDK access already grants. Firebase expires a custom token
   * ~1 hour after minting, and it's single-purpose (exchanging it here is
   * the only thing it's good for) — never store one longer than needed to
   * use it once.
   */
  signInWithToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function syncSessionCookie(user: User | null): Promise<void> {
  if (!user) {
    const response = await fetch('/api/auth/session', { method: 'DELETE' });
    if (!response.ok) {
      throw new Error('Failed to clear the session cookie.');
    }
    return;
  }
  const idToken = await user.getIdToken();
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) {
    throw new Error('Failed to establish a session for the signed-in user.');
  }
}

/**
 * Signs the user back out client-side if the server-side session cookie
 * couldn't be established, so Firebase's client auth state never says
 * "signed in" while the server has no matching session — which would
 * otherwise strand the user in a loop where the middleware keeps gating
 * protected routes despite the client believing it's authenticated.
 */
async function establishSessionOrRollBack(user: User): Promise<void> {
  try {
    await syncSessionCookie(user);
  } catch (error) {
    await firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionSyncing, setSessionSyncing] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      sessionSyncing,
      async signUpWithEmail(email, password) {
        setSessionSyncing(true);
        try {
          const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
          // Unlike Google SSO, Firebase never marks an email/password account's
          // email verified on its own — and org invites are only safe to accept
          // once it is (see EmailNotVerifiedError). Best-effort: a delivery
          // failure here shouldn't block sign-up itself.
          await sendEmailVerification(credential.user).catch(() => undefined);
          await establishSessionOrRollBack(credential.user);
        } finally {
          setSessionSyncing(false);
        }
      },
      async signInWithEmail(email, password) {
        setSessionSyncing(true);
        try {
          const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
          await establishSessionOrRollBack(credential.user);
        } finally {
          setSessionSyncing(false);
        }
      },
      async signInWithGoogle() {
        setSessionSyncing(true);
        try {
          const credential = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
          await establishSessionOrRollBack(credential.user);
        } finally {
          setSessionSyncing(false);
        }
      },
      async signInWithToken(token) {
        setSessionSyncing(true);
        try {
          const credential = await signInWithCustomToken(getFirebaseAuth(), token);
          await establishSessionOrRollBack(credential.user);
        } finally {
          setSessionSyncing(false);
        }
      },
      async signOut() {
        await firebaseSignOut(getFirebaseAuth());
        await syncSessionCookie(null);
      },
    }),
    [user, loading, sessionSyncing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Reads the current Firebase Auth session; must be used under `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
