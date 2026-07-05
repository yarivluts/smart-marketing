'use client';

import { useMemo, type ReactNode } from 'react';
import type { Principal } from '@growthos/shared';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { PermissionProvider } from '@/lib/permissions/permission-context';

const NO_BINDINGS: never[] = [];

function AuthenticatedPermissionProvider({ children }: { children: ReactNode }): React.ReactElement {
  const { user } = useAuth();
  const principal = useMemo<Principal | null>(
    () => (user ? { type: 'user', id: user.uid } : null),
    [user],
  );
  // Role bindings aren't looked up yet (pending KAN-22/KAN-26 wiring into the
  // web app), so every principal is granted zero bindings — deny-by-default,
  // same contract PermissionProvider documents for the pre-KAN-21 state.
  return (
    <PermissionProvider principal={principal} bindings={NO_BINDINGS}>
      {children}
    </PermissionProvider>
  );
}

/** Wires the Firebase Auth session into the client-side permission gate. */
export function AppProviders({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <AuthProvider>
      <AuthenticatedPermissionProvider>{children}</AuthenticatedPermissionProvider>
    </AuthProvider>
  );
}
