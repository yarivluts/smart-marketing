'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PolicyBinding, Role } from '@growthos/shared';
import type { MembershipStatus } from '@growthos/firebase-orm-models';
import { useAuth } from '@/lib/auth/auth-context';

export interface OrgMembershipSummary {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  role: Role;
  status: MembershipStatus;
}

interface OrgContextResponse {
  userId: string | null;
  memberships: OrgMembershipSummary[];
  bindings: PolicyBinding[];
}

export interface OrgContextValue extends OrgContextResponse {
  loading: boolean;
  refresh: () => Promise<void>;
}

const EMPTY_RESPONSE: OrgContextResponse = { userId: null, memberships: [], bindings: [] };

const OrgContext = createContext<OrgContextValue>({
  ...EMPTY_RESPONSE,
  loading: true,
  refresh: async () => undefined,
});

/**
 * Fetches the signed-in user's org memberships and role bindings once per
 * sign-in (via `/api/orgs/context`) and makes them available to the org
 * switcher, project/member lists, and `PermissionProvider` alike, so every
 * consumer sees the same data without each page re-fetching it.
 */
export function OrgProvider({ children }: { children: ReactNode }): React.ReactElement {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<OrgContextResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setData(EMPTY_RESPONSE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/orgs/context');
      setData(response.ok ? ((await response.json()) as OrgContextResponse) : EMPTY_RESPONSE);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const value = useMemo<OrgContextValue>(() => ({ ...data, loading, refresh }), [data, loading, refresh]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrgContext(): OrgContextValue {
  return useContext(OrgContext);
}
