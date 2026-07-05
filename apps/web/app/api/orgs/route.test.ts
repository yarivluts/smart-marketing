import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { listMembershipsWithOrganizations } from '@growthos/firebase-orm-models';
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

function fakeSession(overrides: Partial<DecodedIdToken> = {}): DecodedIdToken {
  const unique = Math.random().toString(36).slice(2);
  return { uid: `uid-${unique}`, email: `owner-${unique}@example.com`, ...overrides } as DecodedIdToken;
}

function createRequest(body: unknown): NextRequest {
  return new NextRequest('https://growthos.test/api/orgs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/orgs', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await POST(createRequest({ name: 'Acme' }));
    expect(response.status).toBe(401);
  });

  it('rejects a request with no organization name', async () => {
    getServerSessionMock.mockResolvedValue(fakeSession());
    const response = await POST(createRequest({}));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'name_required' });
  });

  it('rejects a blank organization name', async () => {
    getServerSessionMock.mockResolvedValue(fakeSession());
    const response = await POST(createRequest({ name: '   ' }));
    expect(response.status).toBe(400);
  });

  it('rejects invalid JSON', async () => {
    getServerSessionMock.mockResolvedValue(fakeSession());
    const request = new NextRequest('https://growthos.test/api/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('creates an org owned by the caller and makes it show up in their memberships', async () => {
    const session = fakeSession();
    getServerSessionMock.mockResolvedValue(session);
    const response = await POST(createRequest({ name: 'Acme Growth' }));

    expect(response.status).toBe(201);
    const { organizationId } = (await response.json()) as { organizationId: string };
    expect(organizationId).toBeTruthy();

    // The route resolves `user.id` from the session itself (not a passed-in
    // param), so proving ownership means proving the *session's* platform
    // user now has a membership in the org it just created.
    const { ensureUserForFirebaseSession } = await import('@growthos/firebase-orm-models');
    const user = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email: session.email as string });
    const memberships = await listMembershipsWithOrganizations(user.id);
    expect(memberships).toContainEqual(
      expect.objectContaining({ organizationId, role: 'org_owner', status: 'active' }),
    );
  });
});
