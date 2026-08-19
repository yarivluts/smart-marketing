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
  listAuditLogEntriesForOrg,
  LocalKmsProvider,
  revealSharedCredentialSecret,
  rotateSharedCredentialSecretKey,
  SharedCredentialNotFoundError,
  setSharedCredentialSecret,
  verifyAuditLogChainForOrg,
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
    const { owner, organization, credential } = await setupOrgWithCredential('Vault Dump Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const plaintextSecret = 'EAABsbCS1234-super-real-meta-token';

    await setSharedCredentialSecret({
      organizationId: organization.id,
      credentialId: credential.id,
      secret: plaintextSecret,
      kms,
      actorId: owner.id,
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
        actorId: second.owner.id,
      }),
    ).rejects.toBeInstanceOf(SharedCredentialNotFoundError);
  });
});

describe('revealSharedCredentialSecret', () => {
  it('decrypts back to the original plaintext', async () => {
    const { owner, organization, credential } = await setupOrgWithCredential('Vault Reveal Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const plaintextSecret = 'sk_live_reveal-me';

    await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: plaintextSecret, kms, actorId: owner.id });
    const revealed = await revealSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, kms });

    expect(revealed).toBe(plaintextSecret);
  });

  it('is deliberately not audit-logged (KAN-44) — it runs on every plugin sync, and logging it would bury real config changes under machine traffic', async () => {
    const { owner, organization, credential } = await setupOrgWithCredential('Vault Reveal Not Audited Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: 'quiet-read-me', kms, actorId: owner.id });

    const entriesBeforeReveal = (await listAuditLogEntriesForOrg(organization.id)).length;
    await revealSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, kms });

    expect(await listAuditLogEntriesForOrg(organization.id)).toHaveLength(entriesBeforeReveal);
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
    const { owner, organization, credential } = await setupOrgWithCredential('Vault Rotate Org');
    const v1 = generateLocalKmsKeyRing('v1');
    const kmsV1 = new LocalKmsProvider(v1.keyRing, v1.currentKeyId);
    const plaintextSecret = 'ya29.rotate-me-token';

    await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: plaintextSecret, kms: kmsV1, actorId: owner.id });

    const v2Key = generateLocalKmsKeyRing('v2').keyRing.v2!;
    const kmsBothKeys = new LocalKmsProvider({ v1: v1.keyRing.v1!, v2: v2Key }, 'v2');
    const rotated = await rotateSharedCredentialSecretKey({ organizationId: organization.id, credentialId: credential.id, kms: kmsBothKeys, actorId: owner.id });
    expect(rotated.encrypted_secret?.keyId).toBe('v2');

    const kmsRetired = new LocalKmsProvider({ v2: v2Key }, 'v2');
    const revealed = await revealSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, kms: kmsRetired });
    expect(revealed).toBe(plaintextSecret);
  });

  it('throws CredentialSecretNotSetError when no secret has ever been set', async () => {
    const { owner, organization, credential } = await setupOrgWithCredential('Vault Rotate Unset Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(
      rotateSharedCredentialSecretKey({ organizationId: organization.id, credentialId: credential.id, kms, actorId: owner.id }),
    ).rejects.toBeInstanceOf(CredentialSecretNotSetError);
  });
});

/**
 * KAN-44 AC ("every config/key change" is audited) for the vault surface: a
 * stored secret is the most sensitive thing an org admin can change, so
 * setting and rotating one must both leave a tamper-evident trail — without
 * that trail itself leaking the secret.
 */
describe('vault audit logging (KAN-44)', () => {
  it('records who set a credential secret, and never writes the secret or its ciphertext into the audit entry', async () => {
    const { owner, organization, credential } = await setupOrgWithCredential('Vault Audit Set Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const plaintextSecret = 'sk_live_audit-must-not-leak-me';

    const stored = await setSharedCredentialSecret({
      organizationId: organization.id,
      credentialId: credential.id,
      secret: plaintextSecret,
      kms,
      actorId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.action === 'credential.secret_set');
    expect(entry).toBeDefined();
    expect(entry!.actor_type).toBe('user');
    expect(entry!.actor_id).toBe(owner.id);
    expect(entry!.target_type).toBe('shared_credential');
    expect(entry!.target_id).toBe(credential.id);
    expect(entry!.before).toEqual({ hasSecret: false });
    expect(entry!.after).toEqual({ hasSecret: true });

    // The whole point: an `audit.read` holder must not be able to recover the
    // secret (or its stored ciphertext) from the audit trail.
    const reloaded = await revealSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, kms });
    expect(reloaded).toBe(plaintextSecret);
    const serializedEntry = JSON.stringify(entry);
    expect(serializedEntry).not.toContain(plaintextSecret);
    expect(serializedEntry).not.toContain(stored.encrypted_secret!.ciphertext);
    expect(serializedEntry).not.toContain(stored.encrypted_secret!.wrappedDek);
  });

  it('distinguishes replacing an existing secret from setting the first one', async () => {
    const { owner, organization, credential } = await setupOrgWithCredential('Vault Audit Replace Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    const setSecret = (secret: string) =>
      setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret, kms, actorId: owner.id });
    await setSecret('first-secret');
    await setSecret('second-secret');

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const setEntries = entries.filter((candidate) => candidate.action === 'credential.secret_set');
    expect(setEntries).toHaveLength(2);
    // Asserted as a set, not by index: `created_at` is millisecond-precision,
    // so two writes this close together have no guaranteed read-back order.
    expect(setEntries.map((candidate) => candidate.before?.hasSecret).sort()).toEqual([false, true]);
    expect(setEntries.every((candidate) => candidate.after?.hasSecret === true)).toBe(true);
  });

  it('records a rotation, flagging whether the envelope was actually re-wrapped', async () => {
    const { owner, organization, credential } = await setupOrgWithCredential('Vault Audit Rotate Org');
    const v1 = generateLocalKmsKeyRing('v1');
    const kmsV1 = new LocalKmsProvider(v1.keyRing, v1.currentKeyId);
    await setSharedCredentialSecret({
      organizationId: organization.id,
      credentialId: credential.id,
      secret: 'ya29.audit-rotate-me',
      kms: kmsV1,
      actorId: owner.id,
    });

    const v2Key = generateLocalKmsKeyRing('v2').keyRing.v2!;
    const kmsBothKeys = new LocalKmsProvider({ v1: v1.keyRing.v1!, v2: v2Key }, 'v2');
    await rotateSharedCredentialSecretKey({
      organizationId: organization.id,
      credentialId: credential.id,
      kms: kmsBothKeys,
      actorId: owner.id,
    });
    // Already current — a genuine no-op, but still an admin action worth recording.
    await rotateSharedCredentialSecretKey({
      organizationId: organization.id,
      credentialId: credential.id,
      kms: kmsBothKeys,
      actorId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const rotateEntries = entries.filter((candidate) => candidate.action === 'credential.secret_rotate');
    expect(rotateEntries).toHaveLength(2);
    // Asserted as a set, not by index — see the replace test's own note.
    expect(rotateEntries.map((candidate) => candidate.after?.rewrapped).sort()).toEqual([false, true]);
    expect(rotateEntries.every((candidate) => candidate.actor_id === owner.id)).toBe(true);
  });

  it('records nothing when rotation is rejected by its own guard (no secret ever set)', async () => {
    const { owner, organization, credential } = await setupOrgWithCredential('Vault Rotate Guard Audit Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(
      rotateSharedCredentialSecretKey({ organizationId: organization.id, credentialId: credential.id, kms, actorId: owner.id }),
    ).rejects.toBeInstanceOf(CredentialSecretNotSetError);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.filter((entry) => entry.action === 'credential.secret_rotate')).toHaveLength(0);
  });

  it('leaves the org audit chain verifiable after vault writes', async () => {
    const { owner, organization, credential } = await setupOrgWithCredential('Vault Audit Chain Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await setSharedCredentialSecret({
      organizationId: organization.id,
      credentialId: credential.id,
      secret: 'chain-me',
      kms,
      actorId: owner.id,
    });
    await rotateSharedCredentialSecretKey({ organizationId: organization.id, credentialId: credential.id, kms, actorId: owner.id });

    await expect(verifyAuditLogChainForOrg(organization.id)).resolves.toMatchObject({ valid: true });
  });
});
