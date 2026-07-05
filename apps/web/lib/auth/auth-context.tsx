'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
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
      async signUpWithEmail(email, password) {
        const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
        await establishSessionOrRollBack(credential.user);
      },
      async signInWithEmail(email, password) {
        const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
        await establishSessionOrRollBack(credential.user);
      },
      async signInWithGoogle() {
        const credential = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
        await establishSessionOrRollBack(credential.user);
      },
      async signOut() {
        await firebaseSignOut(getFirebaseAuth());
        await syncSessionCookie(null);
      },
    }),
    [user, loading],
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
