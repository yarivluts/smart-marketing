import 'reflect-metadata';
import { getApp } from 'firebase/app';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createSharedCredential,
  CredentialSecretNotSetError,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  LocalKmsProvider,
  revealSharedCredentialSecret,
  rotateSharedCredentialSecretKey,
  SharedCredentialNotFoundError,
  setSharedCredentialSecret,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-29's vault module: Firestore-dump unreadability + key rotation. */

const APP_NAME = 'vault-service-tests';

beforeAll(async () => {
  await connectToFirestoreEmulator(APP_NAME);
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithCredential(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const credential = await createSharedCredential({
    organizationId: organization.id,
    name: 'Agency Meta MCC',
    provider: 'meta_ads',
    availableScopes: ['act_1'],
    createdByUserId: owner.id,
  });
  return { owner, organization, credential };
}

async function readRawCredentialDoc(organizationId: string, credentialId: string): Promise<Record<string, unknown>> {
  const firestore = getFirestore(getApp(APP_NAME));
  const snapshot = await getDoc(doc(firestore, `organizations/${organizationId}/shared_credentials/${credentialId}`));
  return snapshot.data() as Record<string, unknown>;
}

describe('setSharedCredentialSecret', () => {
  it('stores only an opaque ciphertext envelope in Firestore — a raw dump never reveals the secret', async () => {
    const { organization, credential } = await setupOrgWithCredential('Vault Dump Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const plaintextSecret = 'EAABsbCS1234-super-real-meta-token';

    await setSharedCredentialSecret({
      organizationId: organization.id,
      credentialId: credential.id,
      secret: plaintextSecret,
      kms,
    });

    const raw = await readRawCredentialDoc(organization.id, credential.id);
    expect(JSON.stringify(raw)).not.toContain(plaintextSecret);
    const envelope = raw.encrypted_secret as { ciphertext: string; wrappedDek: string; keyId: string };
    expect(typeof envelope.ciphertext).toBe('string');
    expect(typeof envelope.wrappedDek).toBe('string');
    expect(envelope.ciphertext).not.toBe(plaintextSecret);
  });

  it('rejects a credential id that does not belong to this organization', async () => {
    const first = await setupOrgWithCredential('Vault Owner Org');
    const second = await setupOrgWithCredential('Vault Other Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(
      setSharedCredentialSecret({
        organizationId: second.organization.id,
        credentialId: first.credential.id,
        secret: 'x',
        kms,
      }),
    ).rejects.toBeInstanceOf(SharedCredentialNotFoundError);
  });
});

describe('revealSharedCredentialSecret', () => {
  it('decrypts back to the original plaintext', async () => {
    const { organization, credential } = await setupOrgWithCredential('Vault Reveal Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const plaintextSecret = 'sk_live_reveal-me';

    await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: plaintextSecret, kms });
    const revealed = await revealSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, kms });

    expect(revealed).toBe(plaintextSecret);
  });

  it('throws CredentialSecretNotSetError when no secret has ever been set', async () => {
    const { organization, credential } = await setupOrgWithCredential('Vault Unset Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(
      revealSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, kms }),
    ).rejects.toBeInstanceOf(CredentialSecretNotSetError);
  });
});

describe('rotateSharedCredentialSecretKey', () => {
  it('re-wraps the stored secret under a new KMS key, and it stays decryptable after the old key is fully retired', async () => {
    const { organization, credential } = await setupOrgWithCredential('Vault Rotate Org');
    const v1 = generateLocalKmsKeyRing('v1');
    const kmsV1 = new LocalKmsProvider(v1.keyRing, v1.currentKeyId);
    const plaintextSecret = 'ya29.rotate-me-token';

    await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: plaintextSecret, kms: kmsV1 });

    const v2Key = generateLocalKmsKeyRing('v2').keyRing.v2!;
    const kmsBothKeys = new LocalKmsProvider({ v1: v1.keyRing.v1!, v2: v2Key }, 'v2');
    const rotated = await rotateSharedCredentialSecretKey({ organizationId: organization.id, credentialId: credential.id, kms: kmsBothKeys });
    expect(rotated.encrypted_secret?.keyId).toBe('v2');

    const kmsRetired = new LocalKmsProvider({ v2: v2Key }, 'v2');
    const revealed = await revealSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, kms: kmsRetired });
    expect(revealed).toBe(plaintextSecret);
  });

  it('throws CredentialSecretNotSetError when no secret has ever been set', async () => {
    const { organization, credential } = await setupOrgWithCredential('Vault Rotate Unset Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(
      rotateSharedCredentialSecretKey({ organizationId: organization.id, credentialId: credential.id, kms }),
    ).rejects.toBeInstanceOf(CredentialSecretNotSetError);
  });
});
