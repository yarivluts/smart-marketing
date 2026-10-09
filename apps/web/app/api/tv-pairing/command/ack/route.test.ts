import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  claimTvPairing,
  createBoard,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  requestTvPairing,
  sendTvPairingCommand,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST } from './route';

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function ackRequest(token?: string, body?: unknown): NextRequest {
  return new NextRequest('https://growthos.test/api/tv-pairing/command/ack', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
}

describe('POST /api/tv-pairing/command/ack (KAN-307)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const response = await POST(ackRequest());
    expect(response.status).toBe(401);
  });

  it('rejects an unknown or unminted device token with 401', async () => {
    const response = await POST(ackRequest('unknown-device-token', { commandId: 'c1', status: 'acknowledged' }));
    expect(response.status).toBe(401);
  });

  it('rejects missing commandId with 400', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
    const { organization } = await createOrganizationWithOwner({ name: 'Ack Missing Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'War room', createdByUserId: owner.id });
    const { deviceToken, code } = await requestTvPairing();
    await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 30,
      reducedMotion: false,
      label: 'Ack TV',
      claimedByUserId: owner.id,
    });

    const response = await POST(ackRequest(deviceToken, { status: 'acknowledged' }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('missing_command_id');
  });

  it('successfully acknowledges a command and updates powerState', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
    const { organization } = await createOrganizationWithOwner({ name: 'Ack Happy Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'War room', createdByUserId: owner.id });
    const { deviceToken, code } = await requestTvPairing();
    const pairing = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 30,
      reducedMotion: false,
      label: 'Happy TV',
      claimedByUserId: owner.id,
    });

    const withCmd = await sendTvPairingCommand({
      organizationId: organization.id,
      projectId: project.id,
      pairingId: pairing.id,
      type: 'display_sleep',
      actorUserId: owner.id,
    });
    const commandId = withCmd.pending_command?.commandId as string;
    expect(commandId).toBeDefined();

    const response = await POST(ackRequest(deviceToken, { commandId, status: 'acknowledged', powerState: 'sleep' }));
    expect(response.status).toBe(200);

    const body = (await response.json()) as { ok: boolean; commandId: string; powerState: string };
    expect(body.ok).toBe(true);
    expect(body.commandId).toBe(commandId);
    expect(body.powerState).toBe('sleep');
  });
});
