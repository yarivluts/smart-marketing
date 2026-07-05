import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserModel, UserOrgMembership } from '@growthos/firebase-orm-models';
import type { PolicyBinding } from '@growthos/shared';
import type { DecodedIdToken } from 'firebase-admin/auth';

const { getServerSessionMock, resolveOrgSessionContextMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  resolveOrgSessionContextMock: vi.fn(),
}));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('@/lib/orgs/session-context', () => ({ resolveOrgSessionContext: resolveOrgSessionContextMock }));

import { findActiveMembership, requireOrgMembership, requireOrgPermission } from './access';

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

function ownerBinding(orgId: string, userId: string): PolicyBinding {
  return { principalType: 'user', principalId: userId, role: 'org_owner', scopeLevel: 'org', scopeId: orgId };
}

describe('requireOrgPermission', () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    resolveOrgSessionContextMock.mockReset();
  });

  it('returns 401 when there is no session', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { error, user } = await requireOrgPermission('org-1', 'project.manage');
    expect(user).toBeUndefined();
    expect(error?.status).toBe(401);
  });

  it(
    'returns 404 — never 403 — when the caller has no active membership in the org, covering both ' +
      '"org does not exist" and "org exists but caller is not a member" (KAN-26 non-enumeration)',
    async () => {
      getServerSessionMock.mockResolvedValue({ uid: 'firebase-uid-1' } as DecodedIdToken);
      resolveOrgSessionContextMock.mockResolvedValue({
        user: { id: 'user-1' } as UserModel,
        memberships: [],
        bindings: [],
      });

      const { error, user } = await requireOrgPermission('org-1', 'project.manage');
      expect(user).toBeUndefined();
      expect(error?.status).toBe(404);
      expect(await error?.json()).toMatchObject({ error: 'not_found' });
    },
  );

  it('returns 403 when the caller is an active member but lacks the specific permission', async () => {
    getServerSessionMock.mockResolvedValue({ uid: 'firebase-uid-1' } as DecodedIdToken);
    resolveOrgSessionContextMock.mockResolvedValue({
      user: { id: 'user-1' } as UserModel,
      memberships: [membership({ organizationId: 'org-1', role: 'viewer' })],
      bindings: [],
    });

    const { error, user } = await requireOrgPermission('org-1', 'project.manage');
    expect(user).toBeUndefined();
    expect(error?.status).toBe(403);
    expect(await error?.json()).toMatchObject({ error: 'forbidden' });
  });

  it('returns the user when the caller is an active member with the permission', async () => {
    getServerSessionMock.mockResolvedValue({ uid: 'firebase-uid-1' } as DecodedIdToken);
    resolveOrgSessionContextMock.mockResolvedValue({
      user: { id: 'user-1' } as UserModel,
      memberships: [membership({ organizationId: 'org-1', role: 'org_owner' })],
      bindings: [ownerBinding('org-1', 'user-1')],
    });

    const { error, user } = await requireOrgPermission('org-1', 'project.manage');
    expect(error).toBeUndefined();
    expect(user?.id).toBe('user-1');
  });
});

describe('requireOrgMembership', () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    resolveOrgSessionContextMock.mockReset();
  });

  it('returns 401 when there is no session', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { error, user } = await requireOrgMembership('org-1');
    expect(user).toBeUndefined();
    expect(error?.status).toBe(401);
  });

  it('returns 404 when the caller has no active membership in the org', async () => {
    getServerSessionMock.mockResolvedValue({ uid: 'firebase-uid-1' } as DecodedIdToken);
    resolveOrgSessionContextMock.mockResolvedValue({
      user: { id: 'user-1' } as UserModel,
      memberships: [],
      bindings: [],
    });

    const { error, user } = await requireOrgMembership('org-1');
    expect(user).toBeUndefined();
    expect(error?.status).toBe(404);
    expect(await error?.json()).toMatchObject({ error: 'not_found' });
  });

  it('returns the user for an active member regardless of role or permissions — even a viewer with zero permissions', async () => {
    getServerSessionMock.mockResolvedValue({ uid: 'firebase-uid-1' } as DecodedIdToken);
    resolveOrgSessionContextMock.mockResolvedValue({
      user: { id: 'user-1' } as UserModel,
      memberships: [membership({ organizationId: 'org-1', role: 'viewer' })],
      bindings: [],
    });

    const { error, user } = await requireOrgMembership('org-1');
    expect(error).toBeUndefined();
    expect(user?.id).toBe('user-1');
  });
});
