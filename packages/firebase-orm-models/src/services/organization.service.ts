import { ENVIRONMENTS, type PolicyBinding, type Role } from '@growthos/shared';
import { EnvironmentModel } from '../models/environment.model';
import { MembershipModel, type MembershipStatus } from '../models/membership.model';
import { OrganizationModel } from '../models/organization.model';
import { ProjectModel } from '../models/project.model';
import { RoleBindingModel } from '../models/role-binding.model';
import { UserModel } from '../models/user.model';

export interface CreateOrganizationParams {
  name: string;
  ownerUserId: string;
  slug?: string;
}

export interface CreateOrganizationResult {
  organization: OrganizationModel;
  membership: MembershipModel;
  roleBinding: RoleBindingModel;
}

/**
 * Creates a brand-new organization and makes `ownerUserId` its first
 * `org_owner`. A new org has no role bindings yet, so there's nothing to gate
 * this behind — see `packages/shared/src/policy`, which deliberately has no
 * `org.create` permission; anyone signed in may create an org and becomes
 * its owner.
 *
 * Writes the org, membership, and role binding as three sequential calls,
 * not one transaction (the ORM's client-SDK-based API doesn't expose one —
 * same accepted tradeoff as `removeMembershipCascade`). A failure partway
 * through leaves a partially-created org (e.g. no owner membership) rather
 * than rolling back; the caller sees the thrown error rather than silent
 * bad state, but nothing here retries or repairs it automatically.
 */
export async function createOrganizationWithOwner(
  params: CreateOrganizationParams,
): Promise<CreateOrganizationResult> {
  const organization = new OrganizationModel();
  organization.name = params.name;
  organization.slug = params.slug;
  await organization.save();

  const membership = new MembershipModel();
  membership.user_id = params.ownerUserId;
  membership.organization_id = organization.id;
  membership.role = 'org_owner';
  membership.status = 'active';
  membership.accepted_at = new Date().toISOString();
  membership.setPathParams({ organization_id: organization.id });
  await membership.save();

  const roleBinding = new RoleBindingModel();
  roleBinding.principal_type = 'user';
  roleBinding.principal_id = params.ownerUserId;
  roleBinding.role = 'org_owner';
  roleBinding.scope_level = 'org';
  roleBinding.scope_id = organization.id;
  roleBinding.setPathParams({ organization_id: organization.id });
  await roleBinding.save();

  return { organization, membership, roleBinding };
}

export interface CreateProjectParams {
  organizationId: string;
  name: string;
  vertical?: string;
}

export interface CreateProjectResult {
  project: ProjectModel;
  environments: EnvironmentModel[];
}

/**
 * Creates a project and provisions its fixed dev/staging/prod environment
 * slices. Same non-atomicity caveat as `createOrganizationWithOwner`: a
 * failure partway through `Promise.all` below can leave a project with
 * fewer than 3 environments rather than rolling back.
 */
export async function createProject(params: CreateProjectParams): Promise<CreateProjectResult> {
  const project = new ProjectModel();
  project.name = params.name;
  project.organization_id = params.organizationId;
  project.vertical = params.vertical;
  project.setPathParams({ organization_id: params.organizationId });
  await project.save();

  const environments = await Promise.all(
    ENVIRONMENTS.map(async (name) => {
      const environment = new EnvironmentModel();
      environment.name = name;
      environment.project_id = project.id;
      environment.setPathParams({ organization_id: params.organizationId, project_id: project.id });
      await environment.save();
      return environment;
    }),
  );

  return { project, environments };
}

/**
 * Every org membership (active or pending invite) for a user, across the
 * whole platform — the data source for the org switcher. Uses a Firestore
 * collection-group query since memberships live at
 * `organizations/{org}/memberships`, one subcollection per org, with no
 * single parent to scope a normal query to.
 */
export async function listMembershipsForUser(userId: string): Promise<MembershipModel[]> {
  return MembershipModel.collectionQuery().where('user_id', '==', userId).get();
}

export interface UserOrgMembership {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  role: Role;
  status: MembershipStatus;
}

/** {@link listMembershipsForUser}, enriched with each organization's display name for the switcher UI. */
export async function listMembershipsWithOrganizations(userId: string): Promise<UserOrgMembership[]> {
  const memberships = await listMembershipsForUser(userId);
  const organizations = await Promise.all(
    memberships.map((membership) => OrganizationModel.init(membership.organization_id)),
  );
  return memberships.map((membership, index) => ({
    membershipId: membership.id,
    organizationId: membership.organization_id,
    organizationName: organizations[index]?.name ?? '',
    role: membership.role,
    status: membership.status ?? 'active',
  }));
}

/**
 * Role bindings held by a user, scoped to a known set of orgs (typically the
 * orgs from {@link listMembershipsForUser}). Bindings live per-org, so this
 * queries each org's `role_bindings` subcollection directly rather than a
 * collection-group query, since `RoleBindingModel` has no stored
 * `organization_id` field to filter a group query by.
 */
export async function listRoleBindingsForUser(
  userId: string,
  organizationIds: readonly string[],
): Promise<RoleBindingModel[]> {
  const results = await Promise.all(
    organizationIds.map((organizationId) =>
      RoleBindingModel.initPath({ organization_id: organizationId })
        .where('principal_type', '==', 'user')
        .where('principal_id', '==', userId)
        .get(),
    ),
  );
  return results.flat();
}

/** Adapts `listRoleBindingsForUser`'s Firestore-shaped `RoleBindingModel[]` result to the framework-agnostic `PolicyBinding[]` `@growthos/shared`'s `can()`/`evaluate()` consume — the one place this mapping is defined, reused by every caller (`apps/web`'s `session-context.ts`, `mcp-oauth.service.ts`, `apps/api`'s `mcp-act-authorization.ts`) instead of each re-implementing the same five-field rename. */
export function toPolicyBindings(bindings: readonly RoleBindingModel[]): PolicyBinding[] {
  return bindings.map((binding) => ({
    principalType: binding.principal_type,
    principalId: binding.principal_id,
    role: binding.role,
    scopeLevel: binding.scope_level,
    scopeId: binding.scope_id,
  }));
}

export interface OrgMemberSummary {
  membershipId: string;
  userId: string;
  email: string;
  displayName?: string;
  role: Role;
  status: MembershipStatus;
}

/** Every member (active or invited) of one org, with the invitee/member's profile resolved for display. */
export async function listOrgMembersWithProfiles(organizationId: string): Promise<OrgMemberSummary[]> {
  // `organization_id` is a required field on every membership in this org's
  // subcollection, so filtering on it is a safe "get everything here" query.
  const memberships = await MembershipModel.initPath({ organization_id: organizationId })
    .where('organization_id', '==', organizationId)
    .get();
  const profiles = await Promise.all(memberships.map((membership) => UserModel.init(membership.user_id)));

  return memberships.map((membership, index) => ({
    membershipId: membership.id,
    userId: membership.user_id,
    email: profiles[index]?.email ?? '',
    displayName: profiles[index]?.display_name,
    role: membership.role,
    status: membership.status ?? 'active',
  }));
}

/** Every project in an org, for the project switcher. */
export async function listOrgProjects(organizationId: string): Promise<ProjectModel[]> {
  return ProjectModel.initPath({ organization_id: organizationId })
    .where('organization_id', '==', organizationId)
    .get();
}

/** The fixed dev/staging/prod environments provisioned for one project (KAN-30's key-creation environment picker). */
export async function listEnvironmentsForProject(
  organizationId: string,
  projectId: string,
): Promise<EnvironmentModel[]> {
  return EnvironmentModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
}
