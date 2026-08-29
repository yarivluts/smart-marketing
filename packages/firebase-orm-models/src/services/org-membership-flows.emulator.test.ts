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
  listAuditLogEntriesForOrg,
  listEnvironmentsForProject,
  listMembershipsForUser,
  listMembershipsWithOrganizations,
  listOrgMembersWithProfiles,
  listOrgProjects,
  listRoleBindingsForUser,
  MembershipAlreadyExistsError,
  MembershipModel,
  MembershipNotActiveError,
  MembershipNotFoundError,
  MembershipNotSuspendedError,
  ProjectNotFoundError,
  ProjectRequiredForRoleError,
  ProjectScopedRoleNotAllowedError,
  reactivateOrgMember,
  removeOrgMember,
  RoleNotChangeableError,
  suspendOrgMember,
  updateMemberRole,
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

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const createEntries = entries.filter((entry) => entry.action === 'organization.create');
    expect(createEntries).toHaveLength(1);
    expect(createEntries[0].target_id).toBe(organization.id);
    expect(createEntries[0].actor_id).toBe(owner.id);
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

    // No `createdByUserId` passed above — no synthetic system actor, same posture `triggerOrchestrationRun` establishes.
    const entriesWithoutActor = await listAuditLogEntriesForOrg(organization.id);
    expect(entriesWithoutActor.filter((entry) => entry.action === 'project.create')).toHaveLength(0);
  });

  it('audit-logs the creation when a creating user is supplied', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('project-owner-audited'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Audited Project Org', ownerUserId: owner.id });

    const { project } = await createProject({
      organizationId: organization.id,
      name: 'Website',
      createdByUserId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const createEntries = entries.filter((entry) => entry.action === 'project.create');
    expect(createEntries).toHaveLength(1);
    expect(createEntries[0].target_id).toBe(project.id);
    expect(createEntries[0].actor_id).toBe(owner.id);
  });
});

describe('listEnvironmentsForProject', () => {
  it('lists the dev/staging/prod environments provisioned for a project', async () => {
    const owner = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('env-list-owner'),
    });
    const { organization } = await createOrganizationWithOwner({ name: 'Env List Org', ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });

    const listed = await listEnvironmentsForProject(organization.id, project.id);
    expect(listed.map((environment) => environment.id).sort()).toEqual(environments.map((e) => e.id).sort());
    expect(listed.map((environment) => environment.name).sort()).toEqual(['dev', 'prod', 'staging']);
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

describe('project-scoped invite -> accept flow (KAN-135)', () => {
  it('invites project_admin/editor/operator for a specific project, then mints a project-scope binding on accept', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('proj-invite-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Project Invite Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    for (const role of ['project_admin', 'editor', 'operator'] as const) {
      const inviteeEmail = uniqueEmail(`proj-invitee-${role}`);
      const invitation = await inviteMemberToOrganization({
        organizationId: organization.id,
        email: inviteeEmail,
        role,
        invitedByUserId: owner.id,
        projectId: project.id,
      });
      expect(invitation.project_id).toBe(project.id);

      const invitee = await ensureUserByEmail(inviteeEmail);
      const { membership, roleBinding } = await acceptInvite({
        organizationId: organization.id,
        membershipId: invitation.id,
        userId: invitee.id,
        callerEmailVerified: true,
      });
      expect(membership.status).toBe('active');
      expect(roleBinding.role).toBe(role);
      expect(roleBinding.scope_level).toBe('project');
      expect(roleBinding.scope_id).toBe(project.id);

      const bindings = await listRoleBindingsForUser(invitee.id, [organization.id]);
      expect(bindings).toContainEqual(expect.objectContaining({ role, scope_level: 'project', scope_id: project.id }));
    }
  });

  it('rejects a project-scoped role invited with no projectId', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('proj-missing-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Project Missing Org', ownerUserId: owner.id });

    await expect(
      inviteMemberToOrganization({
        organizationId: organization.id,
        email: uniqueEmail('proj-missing-invitee'),
        role: 'editor',
        invitedByUserId: owner.id,
      }),
    ).rejects.toThrow(ProjectRequiredForRoleError);
  });

  it('rejects an org-scoped role (org_admin/viewer) invited with a projectId', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('proj-notallowed-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Project Not Allowed Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    await expect(
      inviteMemberToOrganization({
        organizationId: organization.id,
        email: uniqueEmail('proj-notallowed-invitee'),
        role: 'viewer',
        invitedByUserId: owner.id,
        projectId: project.id,
      }),
    ).rejects.toThrow(ProjectScopedRoleNotAllowedError);
  });

  it('rejects a projectId that belongs to a different organization', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('cross-org-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Cross Org Owner Org', ownerUserId: owner.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('other-org-owner') });
    const { organization: otherOrg } = await createOrganizationWithOwner({ name: 'Other Org', ownerUserId: otherOwner.id });
    const { project: otherOrgProject } = await createProject({ organizationId: otherOrg.id, name: 'Other Org Project' });

    await expect(
      inviteMemberToOrganization({
        organizationId: organization.id,
        email: uniqueEmail('cross-org-invitee'),
        role: 'editor',
        invitedByUserId: owner.id,
        projectId: otherOrgProject.id,
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('rejects a projectId that does not exist at all', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('nx-project-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Nonexistent Project Org', ownerUserId: owner.id });

    await expect(
      inviteMemberToOrganization({
        organizationId: organization.id,
        email: uniqueEmail('nx-project-invitee'),
        role: 'operator',
        invitedByUserId: owner.id,
        projectId: 'does-not-exist',
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('leaves the existing org-scope invite/accept behavior unchanged for org_admin/viewer', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('unchanged-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Unchanged Org', ownerUserId: owner.id });

    const inviteeEmail = uniqueEmail('unchanged-invitee');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: inviteeEmail,
      role: 'org_admin',
      invitedByUserId: owner.id,
    });
    expect(invitation.project_id).toBeFalsy();

    const invitee = await ensureUserByEmail(inviteeEmail);
    const { roleBinding } = await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: invitee.id,
      callerEmailVerified: true,
    });
    expect(roleBinding.scope_level).toBe('org');
    expect(roleBinding.scope_id).toBe(organization.id);
  });
});

describe('ensureUserForFirebaseSession identity merge (KAN-133)', () => {
  it('still binds firebaseUid to the placeholder on an unverified first sign-in — gating the bind itself would orphan the invite forever', async () => {
    const inviteeEmail = uniqueEmail('unverified-bind-invitee');
    const placeholder = await ensureUserByEmail(inviteeEmail);

    const invitee = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: inviteeEmail,
      emailVerified: false,
    });

    expect(invitee.id).toBe(placeholder.id);
    expect(invitee.firebaseUid).toBeTruthy();
  });

  it('does not let an unverified sign-in overwrite the placeholder\'s display name/photo — closes the profile-planting half of the placeholder-hijack path', async () => {
    const inviteeEmail = uniqueEmail('unverified-profile-invitee');
    await ensureUserByEmail(inviteeEmail);

    const attacker = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: inviteeEmail,
      displayName: 'Attacker Name',
      photoUrl: 'https://example.com/attacker.png',
      emailVerified: false,
    });
    expect(attacker.display_name).toBeFalsy();
    expect(attacker.photo_url).toBeFalsy();

    // A later, verified sign-in against the same email (a different
    // firebaseUid — ensureUserForFirebaseSession's `byFirebaseUid` lookup
    // would otherwise short-circuit past the email-merge branch entirely for
    // the attacker's own uid) still gets to set the profile fields once
    // verified — the gate lifts, it isn't a permanent lockout.
    const verifiedLater = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: inviteeEmail,
      displayName: 'Real Name',
      photoUrl: 'https://example.com/real.png',
      emailVerified: true,
    });
    expect(verifiedLater.id).toBe(attacker.id);
    expect(verifiedLater.display_name).toBe('Real Name');
    expect(verifiedLater.photo_url).toBe('https://example.com/real.png');
  });

  it('still writes display name/photo on a verified first sign-in (unchanged legitimate behavior)', async () => {
    const inviteeEmail = uniqueEmail('verified-profile-invitee');
    await ensureUserByEmail(inviteeEmail);

    const invitee = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: inviteeEmail,
      displayName: 'Verified Name',
      photoUrl: 'https://example.com/verified.png',
      emailVerified: true,
    });

    expect(invitee.display_name).toBe('Verified Name');
    expect(invitee.photo_url).toBe('https://example.com/verified.png');
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

    await removeOrgMember(organization.id, invitation.id, owner.id);

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

    await removeOrgMember(organization.id, invitation.id, owner.id);

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

    await expect(removeOrgMember(organization.id, 'does-not-exist', owner.id)).rejects.toThrow(MembershipNotFoundError);
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

    await expect(removeOrgMember(organization.id, membership.id, owner.id)).rejects.toThrow(LastOwnerError);

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

    await removeOrgMember(organization.id, ownerAMembership.id, ownerA.id);

    const remaining = await listMembershipsWithOrganizations(ownerB.id);
    expect(remaining).toContainEqual(expect.objectContaining({ organizationId: organization.id, role: 'org_owner' }));
  });
});

describe('updateMemberRole', () => {
  it('changes an active member from org_admin to viewer, updating both the membership and its role binding', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('umr-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Role Update Org', ownerUserId: owner.id });

    const memberEmail = uniqueEmail('umr-member');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: memberEmail,
      role: 'org_admin',
      invitedByUserId: owner.id,
    });
    const member = await ensureUserByEmail(memberEmail);
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: member.id,
      callerEmailVerified: true,
    });

    const updated = await updateMemberRole(organization.id, invitation.id, 'viewer', owner.id);
    expect(updated.role).toBe('viewer');

    const reloaded = await MembershipModel.init(invitation.id, { organization_id: organization.id });
    expect(reloaded?.role).toBe('viewer');

    const bindings = await listRoleBindingsForUser(member.id, [organization.id]);
    const orgBinding = bindings.find((binding) => binding.scope_level === 'org' && binding.scope_id === organization.id);
    expect(orgBinding?.role).toBe('viewer');
  });

  it('changes a pending invite (no role binding yet) without erroring', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('umr-pending-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Role Update Pending Org', ownerUserId: owner.id });

    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: uniqueEmail('umr-pending-invitee'),
      role: 'viewer',
      invitedByUserId: owner.id,
    });

    const updated = await updateMemberRole(organization.id, invitation.id, 'org_admin', owner.id);
    expect(updated.role).toBe('org_admin');
    expect(updated.status).toBe('invited');
  });

  it('records an audit log entry for the role change', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('umr-audit-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Role Update Audit Org', ownerUserId: owner.id });

    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: uniqueEmail('umr-audit-invitee'),
      role: 'viewer',
      invitedByUserId: owner.id,
    });

    await updateMemberRole(organization.id, invitation.id, 'org_admin', owner.id);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries).toContainEqual(expect.objectContaining({ action: 'membership.role_updated', target_id: invitation.id }));
  });

  it('throws RoleNotChangeableError when the current role is org_owner', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('umr-owner-role') });
    const { organization, membership } = await createOrganizationWithOwner({ name: 'Role Update Owner Org', ownerUserId: owner.id });

    await expect(updateMemberRole(organization.id, membership.id, 'viewer', owner.id)).rejects.toThrow(RoleNotChangeableError);
  });

  it('throws MembershipNotFoundError for a membership that does not exist', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('umr-404-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Role Update 404 Org', ownerUserId: owner.id });

    await expect(updateMemberRole(organization.id, 'does-not-exist', 'viewer', owner.id)).rejects.toThrow(MembershipNotFoundError);
  });

  it('throws RoleNotChangeableError for a project-scoped member (project_admin/editor/operator) — this surface only swaps org_admin/viewer (KAN-135)', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('umr-proj-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Role Update Project Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: uniqueEmail('umr-proj-invitee'),
      role: 'editor',
      invitedByUserId: owner.id,
      projectId: project.id,
    });

    await expect(updateMemberRole(organization.id, invitation.id, 'viewer', owner.id)).rejects.toThrow(RoleNotChangeableError);
  });
});

describe('suspendOrgMember / reactivateOrgMember (KAN-132)', () => {
  it('removes an active member\'s role binding without removing the membership, then restores it on reactivation', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('suspend-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Suspend Org', ownerUserId: owner.id });

    const memberEmail = uniqueEmail('suspend-member');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: memberEmail,
      role: 'org_admin',
      invitedByUserId: owner.id,
    });
    const member = await ensureUserByEmail(memberEmail);
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: member.id,
      callerEmailVerified: true,
    });
    expect(await listRoleBindingsForUser(member.id, [organization.id])).toHaveLength(1);

    const suspended = await suspendOrgMember(organization.id, invitation.id, owner.id);
    expect(suspended.status).toBe('suspended');
    expect(suspended.role).toBe('org_admin');

    // Membership survives (with its role, invited_by, accepted_at intact) — only the binding is gone.
    const stillThere = await MembershipModel.init(invitation.id, { organization_id: organization.id });
    expect(stillThere?.status).toBe('suspended');
    expect(stillThere?.role).toBe('org_admin');
    expect(stillThere?.accepted_at).toBeTruthy();
    expect(await listRoleBindingsForUser(member.id, [organization.id])).toHaveLength(0);

    const reactivated = await reactivateOrgMember(organization.id, invitation.id, owner.id);
    expect(reactivated.status).toBe('active');

    const bindingsAfter = await listRoleBindingsForUser(member.id, [organization.id]);
    expect(bindingsAfter).toHaveLength(1);
    expect(bindingsAfter[0].role).toBe('org_admin');
    expect(bindingsAfter[0].scope_level).toBe('org');
    expect(bindingsAfter[0].scope_id).toBe(organization.id);
  });

  it('records audit log entries for both suspension and reactivation', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('suspend-audit-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Suspend Audit Org', ownerUserId: owner.id });

    const memberEmail = uniqueEmail('suspend-audit-member');
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

    await suspendOrgMember(organization.id, invitation.id, owner.id);
    await reactivateOrgMember(organization.id, invitation.id, owner.id);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries).toContainEqual(expect.objectContaining({ action: 'membership.suspended', target_id: invitation.id }));
    expect(entries).toContainEqual(expect.objectContaining({ action: 'membership.reactivated', target_id: invitation.id }));
  });

  it('rejects suspending a pending invite (nothing active to pause)', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('suspend-pending-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Suspend Pending Org', ownerUserId: owner.id });

    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: uniqueEmail('suspend-pending-invitee'),
      role: 'viewer',
      invitedByUserId: owner.id,
    });

    await expect(suspendOrgMember(organization.id, invitation.id, owner.id)).rejects.toThrow(MembershipNotActiveError);
  });

  it('rejects suspending an already-suspended member', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('suspend-twice-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Suspend Twice Org', ownerUserId: owner.id });

    const memberEmail = uniqueEmail('suspend-twice-member');
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

    await suspendOrgMember(organization.id, invitation.id, owner.id);
    await expect(suspendOrgMember(organization.id, invitation.id, owner.id)).rejects.toThrow(MembershipNotActiveError);
  });

  it('rejects reactivating a member that is not suspended', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('reactivate-not-owner') });
    const { organization, membership } = await createOrganizationWithOwner({ name: 'Reactivate Not Org', ownerUserId: owner.id });

    await expect(reactivateOrgMember(organization.id, membership.id, owner.id)).rejects.toThrow(MembershipNotSuspendedError);
  });

  it('throws MembershipNotFoundError for suspend/reactivate on a membership that does not exist', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('suspend-404-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Suspend 404 Org', ownerUserId: owner.id });

    await expect(suspendOrgMember(organization.id, 'does-not-exist', owner.id)).rejects.toThrow(MembershipNotFoundError);
    await expect(reactivateOrgMember(organization.id, 'does-not-exist', owner.id)).rejects.toThrow(MembershipNotFoundError);
  });

  it('refuses to suspend the last active org_owner, leaving the org manageable', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('suspend-sole-owner') });
    const { organization, membership } = await createOrganizationWithOwner({ name: 'Suspend Sole Owner Org', ownerUserId: owner.id });

    await expect(suspendOrgMember(organization.id, membership.id, owner.id)).rejects.toThrow(LastOwnerError);

    const bindings = await listRoleBindingsForUser(owner.id, [organization.id]);
    expect(bindings).toHaveLength(1);
  });

  it('allows suspending an org_owner as long as another active org_owner remains', async () => {
    const ownerA = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('suspend-co-owner-a') });
    const { organization, membership: ownerAMembership } = await createOrganizationWithOwner({
      name: 'Suspend Co-Owned Org',
      ownerUserId: ownerA.id,
    });

    const ownerBEmail = uniqueEmail('suspend-co-owner-b');
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

    const promoted = await MembershipModel.init(invitation.id, { organization_id: organization.id });
    promoted!.role = 'org_owner';
    await promoted!.save();

    await suspendOrgMember(organization.id, ownerAMembership.id, ownerA.id);

    const reloaded = await MembershipModel.init(ownerAMembership.id, { organization_id: organization.id });
    expect(reloaded?.status).toBe('suspended');
  });

  it('restores a project-scoped member\'s binding at its original project scope, not org scope (KAN-135)', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('suspend-proj-owner') });
    const { organization } = await createOrganizationWithOwner({ name: 'Suspend Project Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    const memberEmail = uniqueEmail('suspend-proj-member');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: memberEmail,
      role: 'project_admin',
      invitedByUserId: owner.id,
      projectId: project.id,
    });
    const member = await ensureUserByEmail(memberEmail);
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: member.id,
      callerEmailVerified: true,
    });

    await suspendOrgMember(organization.id, invitation.id, owner.id);
    expect(await listRoleBindingsForUser(member.id, [organization.id])).toHaveLength(0);

    const reactivated = await reactivateOrgMember(organization.id, invitation.id, owner.id);
    expect(reactivated.status).toBe('active');

    const bindingsAfter = await listRoleBindingsForUser(member.id, [organization.id]);
    expect(bindingsAfter).toHaveLength(1);
    expect(bindingsAfter[0].role).toBe('project_admin');
    expect(bindingsAfter[0].scope_level).toBe('project');
    expect(bindingsAfter[0].scope_id).toBe(project.id);
  });
});
