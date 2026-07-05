import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserByEmail,
  ensureUserForFirebaseSession,
  findUserByEmail,
  InviteAlreadyResolvedError,
  InviteEmailMismatchError,
  inviteMemberToOrganization,
  InviteNotFoundError,
  listMembershipsForUser,
  listMembershipsWithOrganizations,
  listOrgMembersWithProfiles,
  listOrgProjects,
  listRoleBindingsForUser,
  MembershipAlreadyExistsError,
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
      role: 'editor',
      invitedByUserId: owner.id,
    });
    expect(invitation.status).toBe('invited');

    const placeholder = await findUserByEmail(inviteeEmail);
    expect(placeholder?.firebaseUid).toBeFalsy();

    const membersBeforeAccept = await listOrgMembersWithProfiles(organization.id);
    expect(membersBeforeAccept).toContainEqual(
      expect.objectContaining({ email: inviteeEmail, status: 'invited', role: 'editor' }),
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
    });
    expect(membership.status).toBe('active');
    expect(roleBinding.role).toBe('editor');
    expect(roleBinding.scope_id).toBe(organization.id);

    const bindings = await listRoleBindingsForUser(invitee.id, [organization.id]);
    expect(bindings).toHaveLength(1);

    const membershipsAfterAccept = await listMembershipsWithOrganizations(invitee.id);
    expect(membershipsAfterAccept).toContainEqual(
      expect.objectContaining({ organizationId: organization.id, status: 'active', role: 'editor' }),
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
      inviteMemberToOrganization({ organizationId: organization.id, email, role: 'editor', invitedByUserId: owner.id }),
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
      acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: impostor.id }),
    ).rejects.toThrow(InviteEmailMismatchError);
  });

  it('rejects accepting a membership that does not exist or was already accepted', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('inviter-resolved'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Resolved Org', ownerUserId: owner.id });

    await expect(
      acceptInvite({ organizationId: organization.id, membershipId: 'does-not-exist', userId: owner.id }),
    ).rejects.toThrow(InviteNotFoundError);

    const inviteeEmail = uniqueEmail('already-active');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: inviteeEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const invitee = await ensureUserByEmail(inviteeEmail);
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: invitee.id });

    await expect(
      acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: invitee.id }),
    ).rejects.toThrow(InviteAlreadyResolvedError);
  });
});
