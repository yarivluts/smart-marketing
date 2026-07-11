import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectFirestoreOrmAdmin, OrganizationModel } from './index';

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
});
