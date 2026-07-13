import 'server-only';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  ensureUserForFirebaseSession,
  listMembershipsWithOrganizations,
  listRoleBindingsForUser,
  type UserModel,
  type UserOrgMembership,
} from '@growthos/firebase-orm-models';
import type { PolicyBinding } from '@growthos/shared';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

export interface OrgSessionContext {
  user: UserModel;
  memberships: UserOrgMembership[];
  bindings: PolicyBinding[];
}

/**
 * Resolves everything a signed-in Firebase session needs for org-scoped
 * permission checks: the platform-wide `UserModel` behind the session (KAN-25
 * closes the gap PROGRESS.md flagged in KAN-21/24 — `principal.id` is now
 * this id, not the raw Firebase UID), every org they're a member of or
 * invited to, and their role bindings across those orgs. This is the single
 * place both `/api/orgs/context` (for the client-side permission provider)
 * and server-rendered org pages resolve session -> access from, so the two
 * never disagree.
 */
/**
 * The `ensureFirestoreOrm -> ensureUserForFirebaseSession` prefix of
 * {@link resolveOrgSessionContext}, split out for callers that only need the
 * platform-wide `UserModel` behind a session — not every org they belong to
 * plus every role binding across those orgs — so they don't pay for (and
 * discard) an N-org membership/role-binding sweep just to read `user.id`
 * (e.g. the KAN-75 MCP OAuth consent route, which resolves its own
 * single-org permission check separately via `issueMcpAuthorizationCode`).
 */
export async function ensureUserForSession(session: DecodedIdToken): Promise<UserModel> {
  await ensureFirestoreOrm();

  // Google SSO always yields a verified email; email/password sign-up does
  // not (Firebase never verifies it on its own — see auth-context.tsx's
  // sendEmailVerification call). Callers that grant privileges based on
  // identity (e.g. accepting an org invite) must check `session.email_verified`
  // themselves — see EmailNotVerifiedError's doc comment for why.
  return ensureUserForFirebaseSession({
    firebaseUid: session.uid,
    email: session.email as string,
    displayName: session.name as string | undefined,
    photoUrl: session.picture as string | undefined,
  });
}

export async function resolveOrgSessionContext(session: DecodedIdToken): Promise<OrgSessionContext> {
  const user = await ensureUserForSession(session);

  const memberships = await listMembershipsWithOrganizations(user.id);
  const activeOrgIds = memberships
    .filter((membership) => membership.status !== 'invited')
    .map((membership) => membership.organizationId);
  const roleBindings = await listRoleBindingsForUser(user.id, activeOrgIds);

  const bindings: PolicyBinding[] = roleBindings.map((binding) => ({
    principalType: binding.principal_type,
    principalId: binding.principal_id,
    role: binding.role,
    scopeLevel: binding.scope_level,
    scopeId: binding.scope_id,
  }));

  return { user, memberships, bindings };
}
