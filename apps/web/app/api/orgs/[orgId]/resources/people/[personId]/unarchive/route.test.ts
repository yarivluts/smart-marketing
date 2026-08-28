import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { archiveOrgPerson, createOrganizationWithOwner, ensureUserForFirebaseSession } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST as createPerson } from '../../route';
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

async function setupArchivedPerson(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  getServerSessionMock.mockResolvedValue(ownerSession);

  const createResponse = await createPerson(
    new NextRequest(`https://growthos.test/api/orgs/${organization.id}/resources/people`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Archived Rep' }),
    }),
    { params: Promise.resolve({ orgId: organization.id }) },
  );
  const { personId } = (await createResponse.json()) as { personId: string };
  await archiveOrgPerson({ organizationId: organization.id, personId, archivedByUserId: owner.id });

  return { ownerSession, organization, personId };
}

describe('POST /api/orgs/[orgId]/resources/people/[personId]/unarchive', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await POST(new Request('https://growthos.test'), { params: Promise.resolve({ orgId: 'org-1', personId: 'person-1' }) });
    expect(response.status).toBe(401);
  });

  it('restores an archived person', async () => {
    const { ownerSession, organization, personId } = await setupArchivedPerson('Unarchive Person Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(new Request('https://growthos.test'), { params: Promise.resolve({ orgId: organization.id, personId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'active' });
  });

  it('returns 404 for a person id that does not exist in this org', async () => {
    const { ownerSession, organization } = await setupArchivedPerson('Unarchive Person Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(new Request('https://growthos.test'), { params: Promise.resolve({ orgId: organization.id, personId: 'does-not-exist' }) });
    expect(response.status).toBe(404);
  });
});
