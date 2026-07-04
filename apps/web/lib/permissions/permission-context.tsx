'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  can,
  type Permission,
  type PolicyBinding,
  type Principal,
  type ResourceScope,
} from '@growthos/shared';

export type { Principal as PermissionPrincipal };

export interface PermissionContextValue {
  principal: Principal | null;
  bindings: readonly PolicyBinding[];
}

const EMPTY_BINDINGS: readonly PolicyBinding[] = [];

const PermissionContext = createContext<PermissionContextValue>({
  principal: null,
  bindings: EMPTY_BINDINGS,
});

export interface PermissionProviderProps {
  principal: Principal | null;
  bindings: readonly PolicyBinding[];
  children: ReactNode;
}

/**
 * Supplies the current principal + their role bindings to `usePermission`.
 * Until KAN-21/KAN-25 land a real session, callers pass `principal: null`
 * (or an empty binding list), which denies every permission check below it —
 * the same deny-by-default contract the API's `PermissionGuard` follows.
 */
export function PermissionProvider(props: PermissionProviderProps): React.ReactElement {
  const { principal, bindings, children } = props;
  const value = useMemo(() => ({ principal, bindings }), [principal, bindings]);
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

/**
 * Client-side permission gate: mirrors the API's deny-by-default policy
 * engine so UI can hide/disable actions a principal can't perform, using
 * the exact same `@growthos/shared` evaluation the API guard runs.
 */
export function usePermission(permission: Permission, resource: ResourceScope): boolean {
  const { principal, bindings } = useContext(PermissionContext);
  if (!principal) {
    return false;
  }
  return can(bindings, principal, permission, resource);
}
