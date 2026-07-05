import { UserModel } from '../models/user.model';

export interface FirebaseSessionProfile {
  firebaseUid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
}

/** Case-insensitive lookup used both by the session bootstrap below and by org invites. */
export async function findUserByEmail(email: string): Promise<UserModel | null> {
  const matches = await UserModel.query().where('email', '==', normalizeEmail(email)).get();
  return matches[0] ?? null;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase();
}

/**
 * Resolves the global `UserModel` row for a signed-in Firebase user, creating
 * it on first sign-in. If a placeholder user was already created by
 * `ensureUserByEmail` (e.g. via an org invite sent before this person ever
 * signed up), that same row is reused and backfilled with the `firebaseUid` —
 * this is what lets an invite created against just an email address resolve
 * to the same platform-wide user id once the invitee actually authenticates,
 * without ever having to rewrite `MembershipModel.user_id` /
 * `RoleBindingModel.principal_id` after the fact.
 */
export async function ensureUserForFirebaseSession(profile: FirebaseSessionProfile): Promise<UserModel> {
  const byFirebaseUid = await UserModel.query().where('firebaseUid', '==', profile.firebaseUid).get();
  if (byFirebaseUid.length > 0) {
    return byFirebaseUid[0];
  }

  const existingByEmail = await findUserByEmail(profile.email);
  if (existingByEmail) {
    existingByEmail.firebaseUid = profile.firebaseUid;
    if (profile.displayName) existingByEmail.display_name = profile.displayName;
    if (profile.photoUrl) existingByEmail.photo_url = profile.photoUrl;
    await existingByEmail.save();
    return existingByEmail;
  }

  const user = new UserModel();
  user.email = normalizeEmail(profile.email);
  user.firebaseUid = profile.firebaseUid;
  user.display_name = profile.displayName;
  user.photo_url = profile.photoUrl;
  user.is_active = true;
  await user.save();
  return user;
}

/**
 * Finds or creates a placeholder `UserModel` for an email address that has no
 * Firebase account yet (the org-invite case: you can invite someone before
 * they've ever signed up). `firebaseUid` stays unset until they sign in and
 * `ensureUserForFirebaseSession` links it.
 */
export async function ensureUserByEmail(email: string): Promise<UserModel> {
  const existing = await findUserByEmail(email);
  if (existing) {
    return existing;
  }

  const user = new UserModel();
  user.email = normalizeEmail(email);
  user.is_active = true;
  await user.save();
  return user;
}
