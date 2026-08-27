import { ENVIRONMENTS, type PolicyBinding, type Role } from '@growthos/shared';
import { EnvironmentModel } from '../models/environment.model';
import { MembershipModel, type MembershipStatus } from '../models/membership.model';
import { OrganizationModel } from '../models/organization.model';
import { ProjectModel } from '../models/project.model';
import { RoleBindingModel } from '../models/role-binding.model';
import { UserModel } from '../models/user.model';
import { recordAuditLogEntry } from './audit-log.service';
import { OrganizationNotFoundError } from './automation-kill-switch.service';

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

  try {
    await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: params.ownerUserId,
      action: 'organization.create',
      targetType: 'organization',
      targetId: organization.id,
      summary: `Created organization "${organization.name}"`,
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return { organization, membership, roleBinding };
}

export class InvalidOrganizationNameError extends Error {
  constructor() {
    super('Organization name is required.');
    this.name = 'InvalidOrganizationNameError';
  }
}

export interface UpdateOrganizationParams {
  organizationId: string;
  name: string;
  /** Omit (or pass an empty string) to clear the slug. */
  slug?: string;
  /** Omit (or pass an empty string) to clear the billing contact. */
  billingEmail?: string;
  actorUserId: string;
}

/**
 * Corrects an org's own identity/billing-contact fields — `name`, `slug`,
 * `billing_email` — the same "create + list only, no way to fix a typo'd
 * definition" gap KAN-100/117/119/120/121 already closed for their own
 * sibling registries, except this one is the tenancy root itself: until now
 * an org's name (set once at `createOrganizationWithOwner` time, from
 * whatever the creator typed) could never be corrected at all, by any path.
 *
 * Gated at the route layer on `billing.manage` (org-owner-only, withheld
 * from `org_admin` per `ROLE_PERMISSIONS`'s own doc comment) rather than the
 * more permissive `project.manage` an `org_admin`/`project_admin` also
 * holds — this is the first real route `billing.manage` gates in this
 * codebase (previously declared in the permission catalog but never wired
 * to an actual surface), and editing the org's own billing contact is
 * exactly the "Owner, not Admin" split that permission exists to enforce.
 *
 * Trims and stores `slug`/`billing_email` as an empty string rather than
 * `undefined` when cleared — never a bare `undefined` — since the ORM's
 * `getDocumentData()` drops an `undefined` field from `updateDoc()`
 * entirely, which would silently leave the old value in Firestore forever
 * (same fix `setProjectSessionReplayUrlTemplate`/`updateResourceTemplate`
 * already apply to their own optional fields).
 */
export async function updateOrganization(params: UpdateOrganizationParams): Promise<OrganizationModel> {
  const organization = await OrganizationModel.init(params.organizationId);
  if (!organization) {
    throw new OrganizationNotFoundError();
  }

  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new InvalidOrganizationNameError();
  }

  const before = { name: organization.name, slug: organization.slug ?? '', billingEmail: organization.billing_email ?? '' };

  organization.name = trimmedName;
  organization.slug = params.slug?.trim() ?? '';
  organization.billing_email = params.billingEmail?.trim() ?? '';
  await organization.save();

  try {
    await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: params.actorUserId,
      action: 'organization.update',
      targetType: 'organization',
      targetId: organization.id,
      summary: `Updated organization "${organization.name}"`,
      before,
      after: { name: organization.name, slug: organization.slug ?? '', billingEmail: organization.billing_email ?? '' },
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return organization;
}

export interface CreateProjectParams {
  organizationId: string;
  name: string;
  vertical?: string;
  /** The human who created this project, if any — audited when present. Omit for a caller with no real user actor (test fixtures, a future non-human caller), the same "no synthetic system actor" posture `triggerOrchestrationRun`'s optional actor param establishes. */
  createdByUserId?: string;
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

  if (params.createdByUserId) {
    try {
      await recordAuditLogEntry({
        organizationId: params.organizationId,
        projectId: project.id,
        actorType: 'user',
        actorId: params.createdByUserId,
        action: 'project.create',
        targetType: 'project',
        targetId: project.id,
        summary: `Created project "${project.name}"`,
      });
    } catch {
      // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
    }
  }

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

/**
 * The one environment a human-facing surface (a board tile, a goal
 * thermometer) queries when nothing narrower is specified: the project's
 * `prod` environment — the same live-traffic slice a `gos_live_` ingest key
 * writes into (`apiKeyModeForEnvironment`), so "the board's numbers" always
 * means "real traffic", never dev/staging test events mixed in. Lifted from
 * `product-analytics.service.ts`'s identical inline resolution (the repo's
 * one prior "project → single environment" precedent) when metric queries
 * became environment-scoped (session-B QA, 2026-08-19). `createProject`
 * provisions exactly one environment per `ENVIRONMENTS` name, so `prod` is
 * always well-defined; `null` only for a project whose provisioning loop
 * partially failed (see `createProject`'s own non-atomicity note), which
 * callers treat as "no environment filter" rather than an error.
 */
export async function resolveDefaultQueryEnvironment(
  organizationId: string,
  projectId: string,
): Promise<EnvironmentModel | null> {
  const environments = await listEnvironmentsForProject(organizationId, projectId);
  return environments.find((environment) => environment.name === 'prod') ?? environments[0] ?? null;
}
