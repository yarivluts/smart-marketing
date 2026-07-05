'use client';

import { useMemo, type ReactNode } from 'react';
import type { Principal } from '@growthos/shared';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { OrgProvider, useOrgContext } from '@/lib/orgs/org-context';
import { PermissionProvider } from '@/lib/permissions/permission-context';

function AuthenticatedPermissionProvider({ children }: { children: ReactNode }): React.ReactElement {
  const { user } = useAuth();
  const { userId, bindings } = useOrgContext();
  // The principal id is the platform-wide `UserModel.id` resolved server-side
  // by `/api/orgs/context` (via `resolveOrgSessionContext`), not the raw
  // Firebase UID — this is what role bindings are keyed on (KAN-25), closing
  // the "every principal gets zero bindings" gap KAN-21/24 deliberately left
  // open. Until that resolution completes, `userId` is null and every check
  // still denies, matching the pre-KAN-25 deny-by-default contract.
  const principal = useMemo<Principal | null>(
    () => (user && userId ? { type: 'user', id: userId } : null),
    [user, userId],
  );
  return (
    <PermissionProvider principal={principal} bindings={bindings}>
      {children}
    </PermissionProvider>
  );
}

/** Wires the Firebase Auth session, org/role-binding lookup, and the client-side permission gate together. */
export function AppProviders({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <AuthProvider>
      <OrgProvider>
        <AuthenticatedPermissionProvider>{children}</AuthenticatedPermissionProvider>
      </OrgProvider>
    </AuthProvider>
  );
}
