import { PERMISSIONS, type Permission } from './permissions';
import type { ScopeLevel } from './scopes';

/**
 * Built-in role bundles (plan 08 §5.2, 06 §3, task breakdown E1.3). Each role
 * is a fixed bundle of permissions; enterprise "custom roles" composed
 * ad-hoc from the permission catalog are a later extension and out of scope
 * for this engine.
 */
export const ROLES = [
  'platform_admin',
  'org_owner',
  'org_admin',
  'project_admin',
  'editor',
  'operator',
  'viewer',
  'ingest_only',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

/**
 * Permission bundle per role. `pii.read` is a separate grant per plan 08
 * §5.4 ("PII gate") so it is withheld even from `project_admin`;
 * `billing.manage` is withheld from `org_admin` (only `org_owner` holds it),
 * mirroring the Owner/Admin split common to org-billing systems.
 * `resources.manage` (org resource library — shared credentials, templates,
 * people registry; plan 08 §1.2) is deliberately withheld from
 * `project_admin` too: the plan requires attach requests to be
 * "project-admin initiated + org-resource-owner approved (or org-admin
 * pushed)", so a project admin gets `project.manage` (enough to *request* an
 * attachment) but only org-scoped roles get `resources.manage` (create
 * library resources, approve/reject/detach attachments). `audit.read` (KAN-44
 * — the org-wide audit log) is likewise withheld from `project_admin`: plan
 * `06 §1` frames the audit log as an org-admin console surface, not a
 * per-project one, and an org's audit trail spans every project under it.
 * `mcp.read` (KAN-75) is granted only to roles that already hold a write
 * permission gating the same data through the web app today (`project_admin`,
 * `editor` — both carry `metrics.write`/`dashboards.write`, the closest thing
 * this catalog has to a "can view" gate for most surfaces, since there is no
 * separate `metrics.read` permission — `dashboards.read` is the one
 * exception, see below). Deliberately withheld from `viewer` even though it
 * now carries `dashboards.read`: `viewer` is one of only two
 * `INVITABLE_ROLES`, bindable at *org* scope with no project picker —
 * granting it `mcp.read` would hand an org-wide invitee real new read access
 * (query_metric, search_customers, ...) across every metric/customer surface,
 * not just the board-viewing access `dashboards.read` narrowly grants. Also
 * withheld from `operator` (automation-only, no read permission today) and
 * `ingest_only` (a write-only machine role).
 *
 * `dashboards.read` exists solely so `viewer` can view board data (found via
 * session-B dogfooding QA, 2026-08-18: a `viewer` got a 404 on a board that
 * worked fine for every write-capable role — every other permission-gated
 * read surface in `apps/web` still checks a *write* permission even to view,
 * so `viewer` still can't see anything else through the web app; this is a
 * narrow, board-specific exception, not a general read/write split across
 * the whole catalog). Granted alongside `dashboards.write` wherever that's
 * already granted (`project_admin`, `editor`) so write-capable roles don't
 * need both permissions checked separately to view what they can also edit.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  platform_admin: ALL_PERMISSIONS,
  org_owner: ALL_PERMISSIONS,
  org_admin: ALL_PERMISSIONS.filter((p) => p !== 'billing.manage'),
  project_admin: [
    'project.manage',
    'members.manage',
    'sources.manage',
    'keys.manage',
    'schema.write',
    'ingest.write',
    'metrics.write',
    'dashboards.write',
    'dashboards.read',
    'automation.approve',
    'automation.execute',
    'data.export',
    'plugin.install',
    'mcp.read',
  ],
  editor: ['metrics.write', 'dashboards.write', 'dashboards.read', 'ai.use', 'mcp.read'],
  operator: ['automation.approve', 'automation.execute'],
  viewer: ['dashboards.read'],
  ingest_only: ['ingest.write'],
};

/** Scope levels each role is meant to be bound at (plan 08 §5.2 "Typical scope"). */
export const ROLE_SCOPE_LEVELS: Readonly<Record<Role, readonly ScopeLevel[]>> = {
  platform_admin: ['platform'],
  org_owner: ['org'],
  org_admin: ['org'],
  project_admin: ['project'],
  editor: ['project'],
  operator: ['project'],
  viewer: ['org', 'project', 'environment'],
  ingest_only: ['project', 'environment'],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Roles grantable via an org-level invite, or via the org-level "change
 * role" surface (KAN-25). Restricted to roles whose `ROLE_SCOPE_LEVELS`
 * includes `'org'` — `org_admin` and `viewer` — because both of those
 * surfaces always bind/rebind the role at `org` scope (no project picker).
 * Granting e.g. `project_admin` (typical scope `['project']`, and carrying
 * `members.manage`/`project.manage`/`keys.manage`) at `org` scope instead
 * of a specific project would hand the invitee that access across every
 * project in the org — effectively `org_admin` in a different name, which
 * is exactly why roles meant for narrower project/environment scopes are
 * excluded here. `platform_admin`/`org_owner` are excluded for a different
 * reason — those aren't handed out by invite at all, they're platform-level
 * or earned by creating the org.
 *
 * `project_admin`/`editor`/`operator` (typical scope `['project']`) are
 * grantable too, but only through a *project*-scoped invite that names the
 * target project — see {@link PROJECT_INVITABLE_ROLES} below and
 * `inviteMemberToOrganization` (`invite.service.ts`, KAN-135), which
 * enforces the org-vs-project role/scope pairing this list alone can't
 * express. `ingest_only` (typical scope `['project', 'environment']`) is
 * deliberately excluded from both lists — it's a machine role minted via
 * `mintApiKey` (KAN-28), never via a human invite.
 */
export const INVITABLE_ROLES = ['org_admin', 'viewer'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(value: string): value is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(value);
}

/**
 * Roles grantable via a *project*-scoped invite (KAN-135) — the counterpart
 * {@link INVITABLE_ROLES}'s own doc comment names as "a separate,
 * project-scoped invite flow". Exactly the roles whose `ROLE_SCOPE_LEVELS`
 * names `'project'` as their typical scope and that a human (not a machine
 * — see `ingest_only` above) is meant to be invited into. `inviteMemberToOrganization`
 * requires a `projectId` for one of these and refuses one for an
 * {@link INVITABLE_ROLES} member — see its own doc comment for the full
 * validation.
 */
export const PROJECT_INVITABLE_ROLES = ['project_admin', 'editor', 'operator'] as const;
export type ProjectInvitableRole = (typeof PROJECT_INVITABLE_ROLES)[number];

export function isProjectInvitableRole(value: string): value is ProjectInvitableRole {
  return (PROJECT_INVITABLE_ROLES as readonly string[]).includes(value);
}

/** Every role grantable via *some* invite flow, at either scope. */
export type InviteRole = InvitableRole | ProjectInvitableRole;

export function isInviteRole(value: string): value is InviteRole {
  return isInvitableRole(value) || isProjectInvitableRole(value);
}

/** The roles an invite may grant at a given scope — {@link INVITABLE_ROLES} for `'org'`, {@link PROJECT_INVITABLE_ROLES} for `'project'`. */
export function invitableRolesForScope(scope: 'org' | 'project'): readonly InviteRole[] {
  return scope === 'org' ? INVITABLE_ROLES : PROJECT_INVITABLE_ROLES;
}
