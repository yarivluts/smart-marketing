import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  listAdStudioRunIndex,
  removeAdStudioRunIndex,
  startAdStudioRun,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-run-index-tests');
});

const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;
const INPUT = { name: 'Sign in 30 seconds', objective: 'Trial signups', productDescription: 'E-signatures', landingPageUrl: null, format: 'vertical' as const, language: 'en', targetSeconds: 20 };

describe('the autopilot run index', () => {
  it('lists every started run for the scheduler, oldest first, with who started it, until it is removed', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
    const { organization } = await createOrganizationWithOwner({ name: 'Runs Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    const first = await createAdStudioBrief({ organizationId: organization.id, projectId: project.id, input: INPUT, createdByUserId: owner.id });
    const second = await createAdStudioBrief({ organizationId: organization.id, projectId: project.id, input: INPUT, createdByUserId: owner.id });
    const older = await startAdStudioRun({ organizationId: organization.id, projectId: project.id, briefId: second.id, options: {}, actorId: owner.id, now: new Date('2026-10-15T08:00:00.000Z') });
    const newer = await startAdStudioRun({ organizationId: organization.id, projectId: project.id, briefId: first.id, options: {}, actorId: owner.id, now: new Date('2026-10-15T09:00:00.000Z') });

    const mine = (await listAdStudioRunIndex()).filter((line) => line.organization_id === organization.id);
    expect(mine.map((line) => [line.run_id, line.brief_id, line.started_by])).toEqual([
      [older.id, second.id, owner.id],
      [newer.id, first.id, owner.id],
    ]);

    await removeAdStudioRunIndex(older.id);
    await removeAdStudioRunIndex('not-a-run');
    expect((await listAdStudioRunIndex()).filter((line) => line.organization_id === organization.id).map((line) => line.run_id)).toEqual([newer.id]);
  });
});
