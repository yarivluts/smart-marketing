import 'reflect-metadata';
import { getApp } from 'firebase/app';
import { doc, getDoc, getFirestore, updateDoc } from 'firebase/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  decryptSecret,
  encryptSecret,
  ensureUserForFirebaseSession,
  LocalKmsProvider,
  rotateVaultSecret,
  VaultSecretNotFoundError,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-29's vault module: envelope encryption + rotation. */

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

async function setupOrg(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  return { owner, organization };
}

/** Reads a document straight off the emulator, bypassing the ORM entirely — the literal "Firestore dump" the AC is about. */
async function rawDump(organizationId: string, vaultSecretId: string): Promise<Record<string, unknown> | undefined> {
  const firestore = getFirestore(getApp(APP_NAME));
  const snapshot = await getDoc(doc(firestore, 'organizations', organizationId, 'vault_secrets', vaultSecretId));
  return snapshot.data();
}

describe('encryptSecret / decryptSecret', () => {
  it('round-trips the original plaintext', async () => {
    const { owner, organization } = await setupOrg('Vault Org');

    const secret = await encryptSecret({
      organizationId: organization.id,
      ownerType: 'shared_credential',
      ownerId: 'cred_123',
      plaintext: 'super-secret-oauth-token-xyz',
      createdByUserId: owner.id,
    });

    const plaintext = await decryptSecret({ organizationId: organization.id, vaultSecretId: secret.id });
    expect(plaintext).toBe('super-secret-oauth-token-xyz');
  });

  it('never persists the plaintext or a usable data key — a raw Firestore dump only shows ciphertext (KAN-29 AC)', async () => {
    const { owner, organization } = await setupOrg('Dump-Proof Org');
    const plaintext = 'super-secret-oauth-token-xyz';

    const secret = await encryptSecret({
      organizationId: organization.id,
      ownerType: 'shared_credential',
      ownerId: 'cred_123',
      plaintext,
      createdByUserId: owner.id,
    });

    const dumped = await rawDump(organization.id, secret.id);
    expect(dumped).toBeTruthy();
    const dumpedJson = JSON.stringify(dumped);
    expect(dumpedJson).not.toContain(plaintext);
    expect(dumpedJson).not.toContain(Buffer.from(plaintext, 'utf8').toString('base64'));
  });

  it('rejects an unknown vault secret id', async () => {
    const { organization } = await setupOrg('Missing Secret Org');

    await expect(
      decryptSecret({ organizationId: organization.id, vaultSecretId: 'does-not-exist' }),
    ).rejects.toBeInstanceOf(VaultSecretNotFoundError);
  });

  it('isolates secrets across organizations: one org can never decrypt a sibling org\'s secret', async () => {
    const owner = await setupOrg('Vault Owner Org');
    const other = await setupOrg('Vault Other Org');
    const secret = await encryptSecret({
      organizationId: owner.organization.id,
      ownerType: 'shared_credential',
      ownerId: 'cred_owner',
      plaintext: 'owner-secret',
      createdByUserId: owner.owner.id,
    });

    await expect(
      decryptSecret({ organizationId: other.organization.id, vaultSecretId: secret.id }),
    ).rejects.toBeInstanceOf(VaultSecretNotFoundError);
  });

  it('persists owner_type/owner_id and round-trips them through Firestore', async () => {
    const { owner, organization } = await setupOrg('Owner Fields Org');

    const secret = await encryptSecret({
      organizationId: organization.id,
      ownerType: 'shared_credential',
      ownerId: 'cred_456',
      plaintext: 'owner-fields-secret',
      createdByUserId: owner.id,
    });

    const reloaded = await encryptSecret({
      organizationId: organization.id,
      ownerType: 'shared_credential',
      ownerId: 'cred_789',
      plaintext: 'another-secret',
      createdByUserId: owner.id,
    });

    expect(secret.owner_type).toBe('shared_credential');
    expect(secret.owner_id).toBe('cred_456');
    expect(reloaded.owner_id).toBe('cred_789');
  });

  it('rejects decrypting a secret whose sealed payload/wrapped key was copied onto a different owner within the same org (substitution attack)', async () => {
    const { owner, organization } = await setupOrg('Substitution Org');
    const secretA = await encryptSecret({
      organizationId: organization.id,
      ownerType: 'shared_credential',
      ownerId: 'cred_a',
      plaintext: 'secret-a',
      createdByUserId: owner.id,
    });
    const secretB = await encryptSecret({
      organizationId: organization.id,
      ownerType: 'shared_credential',
      ownerId: 'cred_b',
      plaintext: 'secret-b',
      createdByUserId: owner.id,
    });

    const firestore = getFirestore(getApp(APP_NAME));
    // Paste secret A's ciphertext/wrapped key onto secret B's document, keeping B's own owner_id.
    await updateDoc(doc(firestore, 'organizations', organization.id, 'vault_secrets', secretB.id), {
      sealed_secret: secretA.sealed_secret,
      wrapped_data_key: secretA.wrapped_data_key,
    });

    await expect(decryptSecret({ organizationId: organization.id, vaultSecretId: secretB.id })).rejects.toThrow();
  });

  it('fails closed if the stored ciphertext is tampered with', async () => {
    const { owner, organization } = await setupOrg('Tamper Org');
    const secret = await encryptSecret({
      organizationId: organization.id,
      ownerType: 'shared_credential',
      ownerId: 'cred_123',
      plaintext: 'super-secret-oauth-token-xyz',
      createdByUserId: owner.id,
    });

    const firestore = getFirestore(getApp(APP_NAME));
    await updateDoc(doc(firestore, 'organizations', organization.id, 'vault_secrets', secret.id), {
      'sealed_secret.ciphertext': Buffer.from('tampered-ciphertext').toString('base64'),
    });

    await expect(decryptSecret({ organizationId: organization.id, vaultSecretId: secret.id })).rejects.toThrow();
  });
});

describe('rotateVaultSecret', () => {
  it('re-wraps the data key under the current KMS version without touching the encrypted payload, and old-version-only providers can no longer unwrap it', async () => {
    const { owner, organization } = await setupOrg('Rotation Org');
    const masterKeys = { v1: Buffer.alloc(32, 1).toString('base64'), v2: Buffer.alloc(32, 2).toString('base64') };
    const kmsV1 = new LocalKmsProvider({ masterKeys: { v1: masterKeys.v1 }, currentKeyVersion: 'v1' });
    const kmsBoth = new LocalKmsProvider({ masterKeys, currentKeyVersion: 'v2' });
    const kmsV2Only = new LocalKmsProvider({ masterKeys: { v2: masterKeys.v2 }, currentKeyVersion: 'v2' });

    const secret = await encryptSecret({
      organizationId: organization.id,
      ownerType: 'shared_credential',
      ownerId: 'cred_123',
      plaintext: 'rotate-me-secret',
      createdByUserId: owner.id,
      kmsProvider: kmsV1,
    });
    expect(secret.wrapped_data_key.keyVersion).toBe('v1');

    const rotated = await rotateVaultSecret({
      organizationId: organization.id,
      vaultSecretId: secret.id,
      kmsProvider: kmsBoth,
    });

    expect(rotated.wrapped_data_key.keyVersion).toBe('v2');
    expect(rotated.rotated_at).toBeTruthy();
    // The whole point of envelope encryption: rotation never touches the encrypted payload itself.
    expect(rotated.sealed_secret).toEqual(secret.sealed_secret);

    const plaintextAfterRotation = await decryptSecret({
      organizationId: organization.id,
      vaultSecretId: secret.id,
      kmsProvider: kmsV2Only,
    });
    expect(plaintextAfterRotation).toBe('rotate-me-secret');

    // A provider that only ever knew the pre-rotation key version can no longer unwrap the now-current version.
    await expect(
      decryptSecret({ organizationId: organization.id, vaultSecretId: secret.id, kmsProvider: kmsV1 }),
    ).rejects.toThrow();
  });

  it('rejects rotating an unknown vault secret id', async () => {
    const { organization } = await setupOrg('Rotation Missing Org');

    await expect(
      rotateVaultSecret({ organizationId: organization.id, vaultSecretId: 'does-not-exist' }),
    ).rejects.toBeInstanceOf(VaultSecretNotFoundError);
  });
});
