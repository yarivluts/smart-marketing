import 'server-only';
import { cache } from 'react';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  ensureUserForFirebaseSession,
  listMembershipsWithOrganizations,
  listRoleBindingsForUser,
  toPolicyBindings,
  type UserModel,
  type UserOrgMembership,
} from '@growthos/firebase-orm-models';
import type { PolicyBinding } from '@growthos/shared';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';

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
  // themselves — see EmailNotVerifiedError's doc comment for why. Passing it
  // through here too gates whether an unverified sign-in can overwrite a
  // placeholder's display name/photo — see ensureUserForFirebaseSession's own
  // doc comment.
  return ensureUserForFirebaseSession({
    firebaseUid: session.uid,
    email: session.email as string,
    displayName: session.name as string | undefined,
    photoUrl: session.picture as string | undefined,
    emailVerified: session.email_verified === true,
  });
}

/**
 * Wrapped in React's `cache()` — see {@link getServerSession}'s own doc
 * comment for why request-level memoization matters here specifically (a
 * layout and the page it wraps both resolving this independently doubled
 * concurrent Firestore traffic and triggered gRPC stream corruption in CI).
 * Relies on `getServerSession()` also being cached so every caller within one
 * request passes the *same* `session` object reference — `cache()` keys an
 * object argument by reference, not deep equality.
 */
export const resolveOrgSessionContext = cache(async (session: DecodedIdToken): Promise<OrgSessionContext> => {
  const user = await ensureUserForSession(session);

  const allMemberships = await listMembershipsWithOrganizations(user.id);
  const activeOrgIds = allMemberships
    .filter((membership) => isActiveMembershipStatus(membership.status))
    .map((membership) => membership.organizationId);
  const roleBindings = await listRoleBindingsForUser(user.id, activeOrgIds);
  const bindings = toPolicyBindings(roleBindings);

  // A pending `invited` membership row lives on `user`'s id even before
  // `emailVerified` is true (see ensureUserForFirebaseSession's doc comment —
  // the firebaseUid bind can't wait on verification without risking an
  // orphaned invite). Without this filter, an attacker who signs up with a
  // target's email before the target does would see every org the target was
  // invited to the moment they load any org page, even though `acceptInvite`
  // itself still refuses to let them act on it. Scoped to `invited`
  // specifically (not "any non-active status"): an `active`-then-`suspended`
  // membership belongs to a real, already-vetted member, not attacker-
  // plantable placeholder data, so it stays visible regardless of
  // verification — hiding it would just be a confusing UX regression for a
  // real member whose own session happens to report unverified.
  const memberships = session.email_verified
    ? allMemberships
    : allMemberships.filter((membership) => membership.status !== 'invited');

  return { user, memberships, bindings };
});
