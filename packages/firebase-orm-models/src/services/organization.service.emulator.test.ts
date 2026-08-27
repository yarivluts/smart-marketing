import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  ensureUserForFirebaseSession,
  InvalidOrganizationNameError,
  listAuditLogEntriesForOrg,
  OrganizationModel,
  OrganizationNotFoundError,
  updateOrganization,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for `updateOrganization` — correcting an org's own
 * `name`/`slug`/`billing_email` once created, closing the same
 * "create + list only, no way to fix a typo'd definition" gap
 * KAN-100/117/119/120/121 already closed for their own sibling registries.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('organization-service-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrganization(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id, slug: 'original-slug' });
  return { owner, organization };
}

describe('updateOrganization', () => {
  it('replaces name, slug, and billing email — persisted to Firestore', async () => {
    const { owner, organization } = await setupOrganization('Org Update Org');

    const updated = await updateOrganization({
      organizationId: organization.id,
      name: 'Updated Org Name',
      slug: 'updated-slug',
      billingEmail: 'billing@example.com',
      actorUserId: owner.id,
    });

    expect(updated.name).toBe('Updated Org Name');
    expect(updated.slug).toBe('updated-slug');
    expect(updated.billing_email).toBe('billing@example.com');
    expect(updated.id).toBe(organization.id);

    const reloaded = await OrganizationModel.init(organization.id);
    expect(reloaded?.name).toBe('Updated Org Name');
    expect(reloaded?.slug).toBe('updated-slug');
    expect(reloaded?.billing_email).toBe('billing@example.com');
  });

  it('clears slug and billing email when given empty strings, rather than leaving the old value', async () => {
    const { owner, organization } = await setupOrganization('Org Update Clear Org');
    await updateOrganization({
      organizationId: organization.id,
      name: 'Org Update Clear Org',
      slug: 'some-slug',
      billingEmail: 'someone@example.com',
      actorUserId: owner.id,
    });

    const cleared = await updateOrganization({
      organizationId: organization.id,
      name: 'Org Update Clear Org',
      slug: '',
      billingEmail: '',
      actorUserId: owner.id,
    });
    expect(cleared.slug).toBe('');
    expect(cleared.billing_email).toBe('');

    const reloaded = await OrganizationModel.init(organization.id);
    expect(reloaded?.slug).toBe('');
    expect(reloaded?.billing_email).toBe('');
  });

  it('rejects a blank name without persisting any change', async () => {
    const { owner, organization } = await setupOrganization('Org Update Blank Name Org');

    await expect(
      updateOrganization({
        organizationId: organization.id,
        name: '   ',
        actorUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidOrganizationNameError);

    const reloaded = await OrganizationModel.init(organization.id);
    expect(reloaded?.name).toBe('Org Update Blank Name Org');
  });

  it('rejects an organization that does not exist', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });

    await expect(
      updateOrganization({ organizationId: 'does-not-exist', name: 'x', actorUserId: owner.id }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  it('records an audit log entry with before/after values', async () => {
    const { owner, organization } = await setupOrganization('Org Update Audit Org');

    const updated = await updateOrganization({
      organizationId: organization.id,
      name: 'Org Update Audit Org (renamed)',
      slug: 'renamed-slug',
      billingEmail: 'billing@example.com',
      actorUserId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const updateEntry = entries.find((entry) => entry.action === 'organization.update' && entry.target_id === organization.id);
    expect(updateEntry).toBeTruthy();
    expect(updateEntry?.actor_id).toBe(owner.id);
    expect(updateEntry?.before).toEqual({ name: 'Org Update Audit Org', slug: 'original-slug', billingEmail: '' });
    expect(updateEntry?.after).toEqual({ name: 'Org Update Audit Org (renamed)', slug: 'renamed-slug', billingEmail: updated.billing_email });
  });
});
