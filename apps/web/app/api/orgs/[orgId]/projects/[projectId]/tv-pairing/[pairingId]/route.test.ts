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
import { DELETE, PATCH } from './route';

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

function revokeRequest(
  orgId: string,
  projectId: string,
  pairingId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; pairingId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/tv-pairing/${pairingId}`, {
      method: 'DELETE',
    }),
    params: Promise.resolve({ orgId, projectId, pairingId }),
  };
}

function updateSettingsRequest(
  orgId: string,
  projectId: string,
  pairingId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; pairingId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/tv-pairing/${pairingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId, pairingId }),
  };
}

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/tv-pairing/[pairingId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = revokeRequest('org-1', 'project-1', 'pairing-1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for an unknown pairing in a real project', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('revoke-tv-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Revoke TV Missing Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = revokeRequest(organization.id, project.id, 'does-not-exist-pairing');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
  });

  it('revokes a paired TV immediately', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('revoke-tv-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Revoke TV Happy Org', ownerUserId: owner.id });
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
      label: 'Doomed TV',
      claimedByUserId: owner.id,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = revokeRequest(organization.id, project.id, pairing.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'revoked' });
  });
});

describe('PATCH /api/orgs/[orgId]/projects/[projectId]/tv-pairing/[pairingId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = updateSettingsRequest('org-1', 'project-1', 'pairing-1', {
      label: 'x',
      boardIds: ['board-1'],
      rotationSeconds: 30,
      reducedMotion: false,
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 400 for a malformed body', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('update-tv-bad-body-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Update TV Bad Body Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = updateSettingsRequest(organization.id, project.id, 'pairing-1', { label: '', boardIds: [], rotationSeconds: 30, reducedMotion: false });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown pairing in a real project', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('update-tv-missing-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Update TV Missing Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'War room', createdByUserId: owner.id });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = updateSettingsRequest(organization.id, project.id, 'does-not-exist-pairing', {
      label: 'x',
      boardIds: [board.id],
      rotationSeconds: 30,
      reducedMotion: false,
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(404);
  });

  it('returns 400 with reasons for an invalid settings edit (board not in project)', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('update-tv-invalid-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Update TV Invalid Org', ownerUserId: owner.id });
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
      label: 'Invalid edit target',
      claimedByUserId: owner.id,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = updateSettingsRequest(organization.id, project.id, pairing.id, {
      label: 'Updated',
      boardIds: ['does-not-exist-board'],
      rotationSeconds: 30,
      reducedMotion: false,
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_tv_pairing');
    expect(body.reasons.length).toBeGreaterThan(0);
  });

  it('returns 409 when editing an already-revoked pairing', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('update-tv-revoked-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Update TV Revoked Org', ownerUserId: owner.id });
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
      label: 'Doomed TV',
      claimedByUserId: owner.id,
    });
    await revokeTvPairing({ organizationId: organization.id, projectId: project.id, pairingId: pairing.id, revokedByUserId: owner.id });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = updateSettingsRequest(organization.id, project.id, pairing.id, {
      label: 'Should not apply',
      boardIds: [board.id],
      rotationSeconds: 30,
      reducedMotion: false,
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'revoked' });
  });

  it('edits a paired TV\'s settings and returns the updated summary view', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('update-tv-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Update TV Happy Org', ownerUserId: owner.id });
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
      label: 'Original label',
      claimedByUserId: owner.id,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = updateSettingsRequest(organization.id, project.id, pairing.id, {
      label: 'Updated label',
      boardIds: [board.id],
      rotationSeconds: 90,
      reducedMotion: true,
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { pairing: { id: string; label: string; rotationSeconds: number; reducedMotion: boolean } };
    expect(body.pairing).toMatchObject({ id: pairing.id, label: 'Updated label', rotationSeconds: 90, reducedMotion: true });
  });
});
