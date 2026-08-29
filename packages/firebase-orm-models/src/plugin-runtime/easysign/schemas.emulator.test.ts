import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getActiveSchemaDefinition,
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import {
  ensureEasySignSchemasRegistered,
  EASYSIGN_DOCUMENT_CREATED_EVENT_NAME,
  EASYSIGN_SIGNING_VIEWED_EVENT_NAME,
  EASYSIGN_DOCUMENT_SIGNED_EVENT_NAME,
  EASYSIGN_DOCUMENT_DECLINED_EVENT_NAME,
} from './schemas';

beforeAll(async () => {
  await connectToFirestoreEmulator('easysign-schemas-emulator-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({
    firebaseUid: unique('firebase-uid'),
    email: uniqueEmail('owner'),
  });
  const { organization } = await createOrganizationWithOwner({
    name: orgName,
    ownerUserId: owner.id,
  });
  const { project } = await createProject({
    organizationId: organization.id,
    name: 'EasySign Tracking Project',
  });
  return { owner, organization, project };
}

describe('EasySign Schema Registration (KAN-81)', () => {
  it('registers all 4 EasySign lifecycle schemas idempotently', async () => {
    const { owner, organization, project } = await setupOrgWithProject('EasySign Integration Org');

    // First call: registers all 4
    await ensureEasySignSchemasRegistered(organization.id, project.id, owner.id);

    const docCreated = await getActiveSchemaDefinition(
      organization.id,
      project.id,
      'event',
      EASYSIGN_DOCUMENT_CREATED_EVENT_NAME,
    );
    expect(docCreated).not.toBeNull();
    expect(docCreated?.name).toBe(EASYSIGN_DOCUMENT_CREATED_EVENT_NAME);
    expect(docCreated?.kind).toBe('event');
    expect(docCreated?.field_defs.find((f) => f.name === 'documentId')?.is_identity_key).toBe(true);

    const signingViewed = await getActiveSchemaDefinition(
      organization.id,
      project.id,
      'event',
      EASYSIGN_SIGNING_VIEWED_EVENT_NAME,
    );
    expect(signingViewed).not.toBeNull();
    expect(signingViewed?.field_defs.find((f) => f.name === 'signerIpHash')?.is_pii).toBe(true);

    const docSigned = await getActiveSchemaDefinition(
      organization.id,
      project.id,
      'event',
      EASYSIGN_DOCUMENT_SIGNED_EVENT_NAME,
    );
    expect(docSigned).not.toBeNull();
    expect(docSigned?.field_defs.find((f) => f.name === 'signerPhoneHash')?.is_identity_key).toBe(true);
    expect(docSigned?.field_defs.find((f) => f.name === 'signerPhoneHash')?.is_pii).toBe(true);

    const docDeclined = await getActiveSchemaDefinition(
      organization.id,
      project.id,
      'event',
      EASYSIGN_DOCUMENT_DECLINED_EVENT_NAME,
    );
    expect(docDeclined).not.toBeNull();
    expect(docDeclined?.field_defs.find((f) => f.name === 'reason')).toBeDefined();

    // Second call: idempotent, does not throw
    await expect(
      ensureEasySignSchemasRegistered(organization.id, project.id, owner.id),
    ).resolves.not.toThrow();
  });
});


