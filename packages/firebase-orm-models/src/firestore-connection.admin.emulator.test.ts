import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectFirestoreOrmAdmin, MembershipModel, OrganizationModel } from './index';

/**
 * Exercises the Admin-SDK connection path (`connectFirestoreOrmAdmin`) — the
 * one real deployments (Cloud Run) use, where the client-SDK path would be
 * rejected by security rules with `permission-denied`. The Admin SDK picks up
 * `FIRESTORE_EMULATOR_HOST` from the environment on its own (set by the
 * `firebase emulators:exec` wrapper around `pnpm test`), so this runs against
 * the same emulator as the client-path suite. Kept in its own test file: the
 * connection module's `connected` flag is per-process state, and vitest
 * isolates test files into separate workers.
 */

beforeAll(async () => {
  await connectFirestoreOrmAdmin({
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-growthos-test',
  });
});

describe('connectFirestoreOrmAdmin (admin-SDK path, emulator)', () => {
  it('performs a model CRUD roundtrip through the admin connection', async () => {
    const org = new OrganizationModel();
    org.name = 'Admin Path Org';
    org.slug = `admin-path-${Math.random().toString(36).slice(2)}`;
    await org.save();
    expect(org.id).toBeTruthy();

    const loaded = await OrganizationModel.init(org.id);
    expect(loaded?.name).toBe('Admin Path Org');

    loaded.name = 'Admin Path Org (renamed)';
    await loaded.save();

    const reloaded = await OrganizationModel.init(org.id);
    expect(reloaded?.name).toBe('Admin Path Org (renamed)');
  });

  it('is idempotent — a second connect resolves without reinitializing', async () => {
    await expect(
      connectFirestoreOrmAdmin({
        projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-growthos-test',
      }),
    ).resolves.toBeUndefined();
  });

  it('runs where-queries through the admin connection (client SDK present)', async () => {
    // Regression guard for the patched @arbel/firebase-orm bug: with the
    // client SDK importable (as in apps/web), the ORM's module-level query
    // functions lock onto the client implementations at import time, and
    // running them against an admin ref crashed with
    // `_freezeSettings is not a function`. The patch forces admin-mode query
    // functions inside initializeAdminApp.
    const slug = `admin-query-${Math.random().toString(36).slice(2)}`;
    const org = new OrganizationModel();
    org.name = 'Admin Query Org';
    org.slug = slug;
    await org.save();

    const matches = await OrganizationModel.query().where('slug', '==', slug).get();
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('Admin Query Org');
  });

  it('runs collection-group queries through the admin connection', async () => {
    // Regression guard for the second patched @arbel/firebase-orm admin bug:
    // getFirestoreQuery calls collectionGroup with the client SDK's two-arg
    // signature (firestore, collectionId), but the admin shim expected only
    // (collectionId) and passed a Firestore instance into
    // firestore.collectionGroup(), crashing with
    // `collectionId.indexOf is not a function`. This is the exact shape of
    // /api/orgs/context's memberships-by-user lookup (listMembershipsForUser).
    const org = new OrganizationModel();
    org.name = 'Admin CG Org';
    org.slug = `admin-cg-${Math.random().toString(36).slice(2)}`;
    await org.save();

    const userId = `cg-user-${Math.random().toString(36).slice(2)}`;
    const membership = new MembershipModel();
    membership.setPathParams('organization_id', org.id);
    membership.user_id = userId;
    membership.organization_id = org.id;
    membership.role = 'owner';
    await membership.save();

    const matches = await MembershipModel.collectionQuery().where('user_id', '==', userId).get();
    expect(matches).toHaveLength(1);
    expect(matches[0].organization_id).toBe(org.id);
  });
});
