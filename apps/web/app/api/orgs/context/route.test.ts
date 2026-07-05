import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, ensureUserForFirebaseSession } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET } from './route';

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

describe('GET /api/orgs/context', () => {
  it('returns an empty, deny-by-default context for an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await GET();
    expect(await response.json()).toEqual({ userId: null, memberships: [], bindings: [] });
  });

  it('returns the real user id, memberships, and org-scoped bindings for a signed-in owner', async () => {
    const firebaseUid = unique('uid');
    const email = `${unique('owner')}@example.com`;
    getServerSessionMock.mockResolvedValue({ uid: firebaseUid, email } as DecodedIdToken);

    const user = await ensureUserForFirebaseSession({ firebaseUid, email });
    const { organization } = await createOrganizationWithOwner({ name: 'Context Org', ownerUserId: user.id });

    const response = await GET();
    const body = (await response.json()) as {
      userId: string;
      memberships: Array<{ organizationId: string; role: string }>;
      bindings: Array<{ scopeId: string; role: string }>;
    };

    expect(body.userId).toBe(user.id);
    expect(body.memberships).toContainEqual(
      expect.objectContaining({ organizationId: organization.id, role: 'org_owner' }),
    );
    expect(body.bindings).toContainEqual(expect.objectContaining({ scopeId: organization.id, role: 'org_owner' }));
  });
});
