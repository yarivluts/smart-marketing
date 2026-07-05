import { beforeAll, describe, expect, it } from 'vitest';
import { createOrganizationWithOwner, ensureUserForFirebaseSession, inviteMemberToOrganization } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getInviteDetails } from './queries';

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  // The test itself calls firebase-orm-models functions directly (to set up
  // fixtures) before `getInviteDetails` would otherwise establish the
  // connection as a side effect, so it must be connected up front here.
  await ensureFirestoreOrm();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

describe('getInviteDetails', () => {
  it('returns null for an unknown membership', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('owner'), email: `${unique('owner')}@example.com` });
    const { organization } = await createOrganizationWithOwner({ name: 'Query Org', ownerUserId: owner.id });

    expect(await getInviteDetails(organization.id, 'does-not-exist')).toBeNull();
  });

  it('resolves org name, role, status, and invitee email for a pending invite', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('owner2'), email: `${unique('owner2')}@example.com` });
    const { organization } = await createOrganizationWithOwner({ name: 'Query Org 2', ownerUserId: owner.id });
    const inviteeEmail = `${unique('invitee')}@example.com`;

    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: inviteeEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });

    const details = await getInviteDetails(organization.id, invitation.id);
    expect(details).toMatchObject({
      organizationId: organization.id,
      organizationName: 'Query Org 2',
      role: 'viewer',
      status: 'invited',
      inviteeEmail,
    });
  });
});
