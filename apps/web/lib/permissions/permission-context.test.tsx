import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PolicyBinding } from '@growthos/shared';
import { PermissionProvider, usePermission } from './permission-context';

function Probe({ permission, orgId }: { permission: 'schema.write' | 'billing.manage'; orgId: string }) {
  const allowed = usePermission(permission, { orgId });
  return <span>{allowed ? 'allowed' : 'denied'}</span>;
}

describe('usePermission', () => {
  it('denies every permission when there is no principal', () => {
    render(
      <PermissionProvider principal={null} bindings={[]}>
        <Probe permission="schema.write" orgId="org-1" />
      </PermissionProvider>,
    );
    expect(screen.getByText('denied')).toBeInTheDocument();
  });

  it('denies when no binding grants the permission', () => {
    const bindings: PolicyBinding[] = [
      { principalType: 'user', principalId: 'u1', role: 'viewer', scopeLevel: 'org', scopeId: 'org-1' },
    ];
    render(
      <PermissionProvider principal={{ type: 'user', id: 'u1' }} bindings={bindings}>
        <Probe permission="billing.manage" orgId="org-1" />
      </PermissionProvider>,
    );
    expect(screen.getByText('denied')).toBeInTheDocument();
  });

  it('allows when a role binding grants the permission at the requested org', () => {
    const bindings: PolicyBinding[] = [
      {
        principalType: 'user',
        principalId: 'u1',
        role: 'org_owner',
        scopeLevel: 'org',
        scopeId: 'org-1',
      },
    ];
    render(
      <PermissionProvider principal={{ type: 'user', id: 'u1' }} bindings={bindings}>
        <Probe permission="billing.manage" orgId="org-1" />
      </PermissionProvider>,
    );
    expect(screen.getByText('allowed')).toBeInTheDocument();
  });

  it('denies a binding scoped to a sibling org', () => {
    const bindings: PolicyBinding[] = [
      {
        principalType: 'user',
        principalId: 'u1',
        role: 'org_owner',
        scopeLevel: 'org',
        scopeId: 'org-other',
      },
    ];
    render(
      <PermissionProvider principal={{ type: 'user', id: 'u1' }} bindings={bindings}>
        <Probe permission="billing.manage" orgId="org-1" />
      </PermissionProvider>,
    );
    expect(screen.getByText('denied')).toBeInTheDocument();
  });
});
