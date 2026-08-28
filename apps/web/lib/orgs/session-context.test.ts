import { beforeAll, describe, expect, it } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  ensureUserByEmail,
  inviteMemberToOrganization,
  suspendOrgMember,
} from '@growthos/firebase-orm-models';
import { can } from '@growthos/shared';
import { resolveOrgSessionContext } from './session-context';

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
});

function fakeSession(overrides: Partial<DecodedIdToken> = {}): DecodedIdToken {
  const unique = Math.random().toString(36).slice(2);
  return {
    uid: overrides.uid ?? `uid-${unique}`,
    email: overrides.email ?? `session-${unique}@example.com`,
    ...overrides,
  } as DecodedIdToken;
}

describe('resolveOrgSessionContext', () => {
  it('resolves the same UserModel across repeated calls for the same Firebase session', async () => {
    const session = fakeSession();
    const first = await resolveOrgSessionContext(session);
    expect(first.memberships).toHaveLength(0);
    expect(first.bindings).toHaveLength(0);

    const second = await resolveOrgSessionContext(session);
    expect(second.user.id).toBe(first.user.id);
  });

  it('produces PolicyBindings that grant real, org-scoped permissions via can() — the KAN-21/24 NO_BINDINGS gap this story closes', async () => {
    const ownerSession = fakeSession();
    const { user: owner } = await resolveOrgSessionContext(ownerSession);
    const { organization } = await createOrganizationWithOwner({ name: 'Ctx Org', ownerUserId: owner.id });

    const otherSession = fakeSession();
    const { user: otherOwner } = await resolveOrgSessionContext(otherSession);
    const { organization: otherOrg } = await createOrganizationWithOwner({
      name: 'Other Ctx Org',
      ownerUserId: otherOwner.id,
    });

    const { bindings, memberships } = await resolveOrgSessionContext(ownerSession);
    expect(memberships.map((membership) => membership.organizationId)).toEqual([organization.id]);

    const principal = { type: 'user' as const, id: owner.id };
    expect(can(bindings, principal, 'members.manage', { orgId: organization.id })).toBe(true);
    // Isolation: this user's bindings must never grant access to an org they aren't a member of.
    expect(can(bindings, principal, 'members.manage', { orgId: otherOrg.id })).toBe(false);
  });

  it('excludes role bindings for orgs the user only has a pending invite to', async () => {
    const ownerSession = fakeSession();
    const { user: owner } = await resolveOrgSessionContext(ownerSession);
    const { organization } = await createOrganizationWithOwner({ name: 'Invite Ctx Org', ownerUserId: owner.id });

    const inviteeEmail = `invitee-${Math.random().toString(36).slice(2)}@example.com`;
    await inviteMemberToOrganization({
      organizationId: organization.id,
      email: inviteeEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });

    const inviteeSession = fakeSession({ email: inviteeEmail });
    const { bindings, memberships } = await resolveOrgSessionContext(inviteeSession);
    expect(memberships).toContainEqual(
      expect.objectContaining({ organizationId: organization.id, status: 'invited' }),
    );
    expect(bindings.some((binding) => binding.scopeId === organization.id)).toBe(false);
  });

  it('excludes role bindings for a suspended member — the KAN-132 gap membership.model.ts flagged (status alone never affected permission checks before this)', async () => {
    const ownerSession = fakeSession();
    const { user: owner } = await resolveOrgSessionContext(ownerSession);
    const { organization } = await createOrganizationWithOwner({ name: 'Suspend Ctx Org', ownerUserId: owner.id });

    const memberEmail = `suspend-ctx-member-${Math.random().toString(36).slice(2)}@example.com`;
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: memberEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const member = await ensureUserByEmail(memberEmail);
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: member.id,
      callerEmailVerified: true,
    });

    const memberSession = fakeSession({ email: memberEmail });
    const before = await resolveOrgSessionContext(memberSession);
    expect(before.bindings.some((binding) => binding.scopeId === organization.id)).toBe(true);

    await suspendOrgMember(organization.id, invitation.id, owner.id);

    const after = await resolveOrgSessionContext(memberSession);
    expect(after.memberships).toContainEqual(
      expect.objectContaining({ organizationId: organization.id, status: 'suspended' }),
    );
    expect(after.bindings.some((binding) => binding.scopeId === organization.id)).toBe(false);
  });
});
