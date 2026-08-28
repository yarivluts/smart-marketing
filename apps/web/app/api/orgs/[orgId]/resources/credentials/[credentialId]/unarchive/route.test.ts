import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { archiveSharedCredential, createOrganizationWithOwner, ensureUserForFirebaseSession } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST as createCredential } from '../../route';
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

async function setupArchivedCredential(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  getServerSessionMock.mockResolvedValue(ownerSession);

  const createResponse = await createCredential(
    new NextRequest(`https://growthos.test/api/orgs/${organization.id}/resources/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Archived Credential', provider: 'generic', availableScopes: [] }),
    }),
    { params: Promise.resolve({ orgId: organization.id }) },
  );
  const { credentialId } = (await createResponse.json()) as { credentialId: string };
  await archiveSharedCredential({ organizationId: organization.id, credentialId, archivedByUserId: owner.id });

  return { ownerSession, organization, credentialId };
}

describe('POST /api/orgs/[orgId]/resources/credentials/[credentialId]/unarchive', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await POST(new Request('https://growthos.test'), { params: Promise.resolve({ orgId: 'org-1', credentialId: 'credential-1' }) });
    expect(response.status).toBe(401);
  });

  it('restores an archived credential', async () => {
    const { ownerSession, organization, credentialId } = await setupArchivedCredential('Unarchive Credential Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(new Request('https://growthos.test'), { params: Promise.resolve({ orgId: organization.id, credentialId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'active' });
  });

  it('returns 404 for a credential id that does not exist in this org', async () => {
    const { ownerSession, organization } = await setupArchivedCredential('Unarchive Credential Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(new Request('https://growthos.test'), { params: Promise.resolve({ orgId: organization.id, credentialId: 'does-not-exist' }) });
    expect(response.status).toBe(404);
  });
});
