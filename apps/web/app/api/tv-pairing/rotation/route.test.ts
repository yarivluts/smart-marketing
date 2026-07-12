import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  claimTvPairing,
  createBoard,
  createGoal,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  ensureUserForFirebaseSession,
  registerMetricDefinition,
  requestTvPairing,
  revokeTvPairing,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET } from './route';

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function rotationRequest(token?: string): NextRequest {
  return new NextRequest(`https://growthos.test/api/tv-pairing/rotation${token ? `?token=${encodeURIComponent(token)}` : ''}`);
}

async function setupClaimedPairing(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
  const metric = await registerMetricDefinition({
    organizationId: organization.id,
    projectId: project.id,
    name: 'signups',
    definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_funnel_event', timeColumn: 'ts', filters: [] } },
    dimensions: [],
    createdByUserId: owner.id,
  });
  const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
  const goal = await createGoal({
    organizationId: organization.id,
    projectId: project.id,
    name: 'Q4 signups',
    metricName: metric.name,
    direction: 'maximize',
    targetValue: 100,
    startDate: '2026-01-01',
    deadline: '2026-12-31',
    rhythm: 'even',
    ownerPersonId: person.id,
    createdByUserId: owner.id,
  });

  const { deviceToken, code } = await requestTvPairing();
  const pairing = await claimTvPairing({
    organizationId: organization.id,
    projectId: project.id,
    code,
    boardIds: [board.id],
    rotationSeconds: 20,
    reducedMotion: false,
    label: 'Rotation Test TV',
    claimedByUserId: owner.id,
  });

  return { owner, organization, project, board, goal, deviceToken, pairing };
}

describe('GET /api/tv-pairing/rotation', () => {
  it('rejects a missing token', async () => {
    const response = await GET(rotationRequest());
    expect(response.status).toBe(401);
  });

  it('rejects an unclaimed (still-pending) token', async () => {
    const { deviceToken } = await requestTvPairing();
    const response = await GET(rotationRequest(deviceToken));
    expect(response.status).toBe(401);
  });

  it('rejects a revoked token', async () => {
    const { deviceToken, pairing, organization, project, owner } = await setupClaimedPairing('TV Rotation Revoked Org');
    await revokeTvPairing({ organizationId: organization.id, projectId: project.id, pairingId: pairing.id, revokedByUserId: owner.id });
    const response = await GET(rotationRequest(deviceToken));
    expect(response.status).toBe(401);
  });

  it('returns the board list and goal thermometers for a claimed pairing', async () => {
    const { deviceToken, board, goal } = await setupClaimedPairing('TV Rotation Org');
    const response = await GET(rotationRequest(deviceToken));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      label: string;
      rotationSeconds: number;
      reducedMotion: boolean;
      boards: Array<{ id: string; name: string }>;
      goals: Array<{ id: string; name: string }>;
    };
    expect(body.label).toBe('Rotation Test TV');
    expect(body.rotationSeconds).toBe(20);
    expect(body.boards).toEqual([{ id: board.id, name: 'Marketing' }]);
    expect(body.goals).toHaveLength(1);
    expect(body.goals[0].id).toBe(goal.id);
  });
});
