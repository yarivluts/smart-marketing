import { describe, expect, it } from 'vitest';
import type { UserOrgMembership } from '@growthos/firebase-orm-models';
import { findActiveMembership } from './access';

function membership(overrides: Partial<UserOrgMembership> = {}): UserOrgMembership {
  return {
    membershipId: 'm1',
    organizationId: 'org-1',
    organizationName: 'Org One',
    role: 'viewer',
    status: 'active',
    ...overrides,
  };
}

describe('findActiveMembership', () => {
  it('finds an active membership for the given org', () => {
    const memberships = [membership()];
    expect(findActiveMembership(memberships, 'org-1')).toBe(memberships[0]);
  });

  it('returns undefined when the user has no membership row for that org at all', () => {
    expect(findActiveMembership([membership({ organizationId: 'org-1' })], 'org-2')).toBeUndefined();
  });

  it('excludes a pending invite — accepting it is a distinct action from already having access', () => {
    const memberships = [membership({ status: 'invited' })];
    expect(findActiveMembership(memberships, 'org-1')).toBeUndefined();
  });

  it('does not confuse two different orgs even when both are present', () => {
    const memberships = [
      membership({ organizationId: 'org-1', membershipId: 'm1' }),
      membership({ organizationId: 'org-2', membershipId: 'm2' }),
    ];
    expect(findActiveMembership(memberships, 'org-2')?.membershipId).toBe('m2');
  });
});
