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
 * library resources, approve/reject/detach attachments).
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
    'automation.approve',
    'automation.execute',
    'data.export',
    'plugin.install',
  ],
  editor: ['metrics.write', 'dashboards.write', 'ai.use'],
  operator: ['automation.approve', 'automation.execute'],
  viewer: [],
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
 * Roles grantable via an org-level invite (KAN-25). Restricted to roles
 * whose `ROLE_SCOPE_LEVELS` includes `'org'` — `org_admin` and `viewer` —
 * because the org invite endpoint always binds the accepted role at `org`
 * scope (there is no project-picker in the invite flow). Granting e.g.
 * `project_admin` (typical scope `['project']`, and carrying
 * `members.manage`/`project.manage`/`keys.manage`) at `org` scope instead
 * of a specific project would hand the invitee that access across every
 * project in the org — effectively `org_admin` in a different name. Roles
 * meant for narrower project/environment scopes (`project_admin`, `editor`,
 * `operator`, `ingest_only`) need a project-scoped invite flow, which is a
 * separate, not-yet-built story. `platform_admin`/`org_owner` are excluded
 * for a different reason — those aren't handed out by invite at all,
 * they're platform-level or earned by creating the org.
 */
export const INVITABLE_ROLES = ['org_admin', 'viewer'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(value: string): value is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(value);
}
