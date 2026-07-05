import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  EmailNotVerifiedError,
  ensureUserByEmail,
  ensureUserForFirebaseSession,
  findUserByEmail,
  InviteAlreadyResolvedError,
  InviteEmailMismatchError,
  inviteMemberToOrganization,
  InviteNotFoundError,
  LastOwnerError,
  listMembershipsForUser,
  listMembershipsWithOrganizations,
  listOrgMembersWithProfiles,
  listOrgProjects,
  listRoleBindingsForUser,
  MembershipAlreadyExistsError,
  MembershipModel,
  MembershipNotFoundError,
  removeOrgMember,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-25's org/membership/invite service layer, in
 * the same style as `models.emulator.test.ts` (KAN-22).
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('org-membership-flows-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

describe('createOrganizationWithOwner', () => {
  it('creates an org, an active owner membership, and an org-scoped owner role binding', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('owner'),
    });

    const { organization, membership, roleBinding } = await createOrganizationWithOwner({
      name: 'Acme Growth',
      ownerUserId: owner.id,
    });

    expect(organization.id).toBeTruthy();
    expect(membership.role).toBe('org_owner');
    expect(membership.status).toBe('active');
    expect(roleBinding.role).toBe('org_owner');
    expect(roleBinding.scope_level).toBe('org');
    expect(roleBinding.scope_id).toBe(organization.id);

    const memberships = await listMembershipsWithOrganizations(owner.id);
    expect(memberships).toContainEqual(
      expect.objectContaining({ organizationId: organization.id, role: 'org_owner', status: 'active' }),
    );

    const bindings = await listRoleBindingsForUser(owner.id, [organization.id]);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].role).toBe('org_owner');
  });
});

describe('cross-org membership listing', () => {
  it('lists one user active in two orgs with different roles via a collection-group query', async () => {
    const user = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('multi-org'),
    });

    const { organization: orgA } = await createOrganizationWithOwner({ name: 'Org A', ownerUserId: user.id });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Org B', ownerUserId: user.id });

    const memberships = await listMembershipsForUser(user.id);
    const orgIds = memberships.map((membership) => membership.organization_id);
    expect(orgIds).toContain(orgA.id);
    expect(orgIds).toContain(orgB.id);
    expect(memberships.every((membership) => membership.role === 'org_owner')).toBe(true);
  });
});

describe('createProject', () => {
  it('provisions the fixed dev/staging/prod environment slices', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('project-owner'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Project Org', ownerUserId: owner.id });

    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });

    expect(project.organization_id).toBe(organization.id);
    expect(environments.map((environment) => environment.name).sort()).toEqual(['dev', 'prod', 'staging']);
    expect(environments.every((environment) => environment.project_id === project.id)).toBe(true);

    const projects = await listOrgProjects(organization.id);
    expect(projects.map((p) => p.id)).toContain(project.id);
  });
});

describe('invite -> accept flow', () => {
  it('invites someone by email before they have signed up, then activates on acceptance', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('inviter'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Invite Org', ownerUserId: owner.id });

    const inviteeEmail = uniqueEmail('invitee');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: inviteeEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    expect(invitation.status).toBe('invited');

    const placeholder = await findUserByEmail(inviteeEmail);
    expect(placeholder?.firebaseUid).toBeFalsy();

    const membersBeforeAccept = await listOrgMembersWithProfiles(organization.id);
    expect(membersBeforeAccept).toContainEqual(
      expect.objectContaining({ email: inviteeEmail, status: 'invited', role: 'viewer' }),
    );

    // The invitee doesn't have their pending invite visible under their own
    // identity yet — nothing has bound their Firebase UID to it.
    const membershipsBeforeSignIn = await listMembershipsForUser(placeholder!.id);
    expect(membershipsBeforeSignIn.some((m) => m.status === 'invited')).toBe(true);

    // Now the invitee actually signs up with the same email: this must reuse
    // the placeholder user row rather than creating a second one.
    const invitee = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: inviteeEmail,
    });
    expect(invitee.id).toBe(placeholder!.id);
    expect(invitee.firebaseUid).toBeTruthy();

    const { membership, roleBinding } = await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: invitee.id,
      callerEmailVerified: true,
    });
    expect(membership.status).toBe('active');
    expect(roleBinding.role).toBe('viewer');
    expect(roleBinding.scope_id).toBe(organization.id);

    const bindings = await listRoleBindingsForUser(invitee.id, [organization.id]);
    expect(bindings).toHaveLength(1);

    const membershipsAfterAccept = await listMembershipsWithOrganizations(invitee.id);
    expect(membershipsAfterAccept).toContainEqual(
      expect.objectContaining({ organizationId: organization.id, status: 'active', role: 'viewer' }),
    );
  });

  it('rejects a second invite to the same org for someone already invited or active', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('inviter-dup'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Dup Invite Org', ownerUserId: owner.id });
    const email = uniqueEmail('dup-invitee');

    await inviteMemberToOrganization({ organizationId: organization.id, email, role: 'viewer', invitedByUserId: owner.id });

    await expect(
      inviteMemberToOrganization({ organizationId: organization.id, email, role: 'org_admin', invitedByUserId: owner.id }),
    ).rejects.toThrow(MembershipAlreadyExistsError);
  });

  it('rejects acceptance by someone other than the invited email', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('inviter-mismatch'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Mismatch Org', ownerUserId: owner.id });

    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: uniqueEmail('real-invitee'),
      role: 'viewer',
      invitedByUserId: owner.id,
    });

    const impostor = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('impostor'),
    });

    await expect(
      acceptInvite({
        organizationId: organization.id,
        membershipId: invitation.id,
        userId: impostor.id,
        callerEmailVerified: true,
      }),
    ).rejects.toThrow(InviteEmailMismatchError);
  });

  it('rejects accepting a membership that does not exist or was already accepted', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('inviter-resolved'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Resolved Org', ownerUserId: owner.id });

    await expect(
      acceptInvite({
        organizationId: organization.id,
        membershipId: 'does-not-exist',
        userId: owner.id,
        callerEmailVerified: true,
      }),
    ).rejects.toThrow(InviteNotFoundError);

    const inviteeEmail = uniqueEmail('already-active');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: inviteeEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const invitee = await ensureUserByEmail(inviteeEmail);
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: invitee.id,
      callerEmailVerified: true,
    });

    await expect(
      acceptInvite({
        organizationId: organization.id,
        membershipId: invitation.id,
        userId: invitee.id,
        callerEmailVerified: true,
      }),
    ).rejects.toThrow(InviteAlreadyResolvedError);
  });

  it('rejects acceptance from a caller whose email is not verified — closes the placeholder-hijack path where an attacker signs up with the invitee\'s email first', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('inviter-unverified'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Unverified Org', ownerUserId: owner.id });

    const inviteeEmail = uniqueEmail('unverified-invitee');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: inviteeEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });

    const invitee = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: inviteeEmail,
    });

    await expect(
      acceptInvite({
        organizationId: organization.id,
        membershipId: invitation.id,
        userId: invitee.id,
        callerEmailVerified: false,
      }),
    ).rejects.toThrow(EmailNotVerifiedError);

    const memberships = await listMembershipsWithOrganizations(invitee.id);
    expect(memberships).toContainEqual(expect.objectContaining({ organizationId: organization.id, status: 'invited' }));
  });
});

describe('removeOrgMember', () => {
  it('revokes a pending invite, cascading away its (nonexistent yet) bindings with no error', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('revoke-owner'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Revoke Org', ownerUserId: owner.id });

    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: uniqueEmail('revoked-invitee'),
      role: 'viewer',
      invitedByUserId: owner.id,
    });

    await removeOrgMember(organization.id, invitation.id);

    await expect(
      acceptInvite({
        organizationId: organization.id,
        membershipId: invitation.id,
        userId: owner.id,
        callerEmailVerified: true,
      }),
    ).rejects.toThrow(InviteNotFoundError);
  });

  it('removes an active member and their role binding', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('remove-owner'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Remove Org', ownerUserId: owner.id });

    const memberEmail = uniqueEmail('removed-member');
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

    await removeOrgMember(organization.id, invitation.id);

    const memberships = await listMembershipsWithOrganizations(member.id);
    expect(memberships).toHaveLength(0);
    const bindings = await listRoleBindingsForUser(member.id, [organization.id]);
    expect(bindings).toHaveLength(0);
  });

  it('rejects removing a membership that does not exist', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('remove-missing-owner'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Remove Missing Org', ownerUserId: owner.id });

    await expect(removeOrgMember(organization.id, 'does-not-exist')).rejects.toThrow(MembershipNotFoundError);
  });

  it('refuses to remove the last active org_owner, leaving the org manageable', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('sole-owner'),
    });
    const { organization, membership } = await createOrganizationWithOwner({
      name: 'Sole Owner Org',
      ownerUserId: owner.id,
    });

    await expect(removeOrgMember(organization.id, membership.id)).rejects.toThrow(LastOwnerError);

    const memberships = await listMembershipsWithOrganizations(owner.id);
    expect(memberships).toContainEqual(expect.objectContaining({ organizationId: organization.id, role: 'org_owner' }));
  });

  it('allows removing an org_owner as long as another active org_owner remains', async () => {
    const ownerA = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('co-owner-a'),
    });
    const { organization, membership: ownerAMembership } = await createOrganizationWithOwner({
      name: 'Co-Owned Org',
      ownerUserId: ownerA.id,
    });

    const ownerBEmail = uniqueEmail('co-owner-b');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: ownerBEmail,
      role: 'org_admin',
      invitedByUserId: ownerA.id,
    });
    const ownerB = await ensureUserByEmail(ownerBEmail);
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: ownerB.id,
      callerEmailVerified: true,
    });

    // Promote ownerB to org_owner directly at the membership layer (no admin
    // "change role" surface exists yet — out of scope here) so there are two
    // active org_owners to exercise the "another owner remains" branch.
    const promoted = await MembershipModel.init(invitation.id, { organization_id: organization.id });
    promoted!.role = 'org_owner';
    await promoted!.save();

    await removeOrgMember(organization.id, ownerAMembership.id);

    const remaining = await listMembershipsWithOrganizations(ownerB.id);
    expect(remaining).toContainEqual(expect.objectContaining({ organizationId: organization.id, role: 'org_owner' }));
  });
});
