import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  claimTvPairing,
  createBoard,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  requestTvPairing,
  revokeTvPairing,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST } from './route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function sessionFor(firebaseUid: string, email: string): Promise<DecodedIdToken> {
  await ensureUserForFirebaseSession({ firebaseUid, email });
  return { uid: firebaseUid, email } as DecodedIdToken;
}

function commandRequest(
  orgId: string,
  projectId: string,
  pairingId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; pairingId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/tv-pairing/${pairingId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId, pairingId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/tv-pairing/[pairingId]/command (KAN-307)', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = commandRequest('org-1', 'project-1', 'pairing-1', { type: 'reboot' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 400 for an invalid or unsupported command type', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('cmd-tv-bad-cmd-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Cmd TV Bad Cmd Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = commandRequest(organization.id, project.id, 'pairing-1', { type: 'invalid_cmd' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_command_type');
  });

  it('returns 404 for an unknown pairing in a real project', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('cmd-tv-missing-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Cmd TV Missing Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = commandRequest(organization.id, project.id, 'does-not-exist-pairing', { type: 'reboot' });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('dispatches a display_sleep command and updates powerState to sleep', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('cmd-tv-sleep-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Cmd TV Sleep Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'War room', createdByUserId: owner.id });
    const { code } = await requestTvPairing();
    const pairing = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 30,
      reducedMotion: false,
      label: 'Conference TV',
      claimedByUserId: owner.id,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = commandRequest(organization.id, project.id, pairing.id, { type: 'display_sleep' });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { success: boolean; command: { type: string; commandId: string }; pairing: { powerState: string } };
    expect(body.success).toBe(true);
    expect(body.command.type).toBe('display_sleep');
    expect(body.pairing.powerState).toBe('sleep');
  });

  it('dispatches a display_wake command and updates powerState to on', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('cmd-tv-wake-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Cmd TV Wake Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'War room', createdByUserId: owner.id });
    const { code } = await requestTvPairing();
    const pairing = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 30,
      reducedMotion: false,
      label: 'Lobby Display',
      claimedByUserId: owner.id,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = commandRequest(organization.id, project.id, pairing.id, { type: 'display_wake' });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { success: boolean; command: { type: string }; pairing: { powerState: string } };
    expect(body.success).toBe(true);
    expect(body.command.type).toBe('display_wake');
    expect(body.pairing.powerState).toBe('on');
  });

  it('returns 409 when sending a command to an already-revoked pairing', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('cmd-tv-revoked-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Cmd TV Revoked Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'War room', createdByUserId: owner.id });
    const { code } = await requestTvPairing();
    const pairing = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 30,
      reducedMotion: false,
      label: 'Revoked TV',
      claimedByUserId: owner.id,
    });
    await revokeTvPairing({ organizationId: organization.id, projectId: project.id, pairingId: pairing.id, revokedByUserId: owner.id });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = commandRequest(organization.id, project.id, pairing.id, { type: 'force_reload' });
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'revoked' });
  });
});
