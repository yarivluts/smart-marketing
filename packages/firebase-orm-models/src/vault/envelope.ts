import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { KmsProvider } from './kms-provider';

const DEK_BYTES = 32;
const GCM_IV_BYTES = 12;

/**
 * A secret, envelope-encrypted at rest (KAN-29). Only `ciphertext` and
 * `wrappedDek` hold key material or the secret itself, and both are opaque
 * base64 blobs — a Firestore document (or a backup/export of one) storing
 * this never carries a usable secret.
 */
export interface SecretEnvelope {
  /** Which KMS key wrapped `wrappedDek` — compare against `KmsProvider.currentKeyId` to tell whether this envelope needs rotating. */
  keyId: string;
  /** The random per-secret data-encryption-key, encrypted by the KMS key named `keyId`. */
  wrappedDek: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

/**
 * Encrypts `plaintext` under a fresh random data-encryption-key (DEK), then
 * wraps that DEK with the KMS provider's current key. `tenantId` (an
 * organization id) both derives the KMS wrapping key and is never itself
 * stored — decrypting with a different tenant id always fails, which is
 * what makes cross-tenant decryption structurally impossible rather than
 * merely disallowed by application code.
 */
export async function encryptSecret(plaintext: string, tenantId: string, kms: KmsProvider): Promise<SecretEnvelope> {
  const dek = randomBytes(DEK_BYTES);
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const wrapped = await kms.wrapDek(dek, tenantId);
  dek.fill(0);

  return {
    keyId: wrapped.keyId,
    wrappedDek: wrapped.ciphertext,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

/** Reverses {@link encryptSecret}. Throws if `tenantId` doesn't match the one the envelope was encrypted under, or if the ciphertext/auth tag has been tampered with. */
export async function decryptSecret(envelope: SecretEnvelope, tenantId: string, kms: KmsProvider): Promise<string> {
  const dek = await kms.unwrapDek({ keyId: envelope.keyId, ciphertext: envelope.wrappedDek }, tenantId);
  const decipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Cheap KMS-key rotation: unwraps the DEK under its current (about to be
 * retired) key and re-wraps it under the provider's new current key,
 * without ever touching `ciphertext` — the whole point of envelope
 * encryption is that rotating a KEK costs one small DEK re-wrap, not
 * re-encrypting every secret it protects. A no-op if the envelope is
 * already wrapped by the provider's current key.
 */
export async function rotateSecretEnvelopeKey(
  envelope: SecretEnvelope,
  tenantId: string,
  kms: KmsProvider,
): Promise<SecretEnvelope> {
  if (envelope.keyId === kms.currentKeyId) {
    return envelope;
  }
  const dek = await kms.unwrapDek({ keyId: envelope.keyId, ciphertext: envelope.wrappedDek }, tenantId);
  const rewrapped = await kms.wrapDek(dek, tenantId);
  dek.fill(0);
  return { ...envelope, keyId: rewrapped.keyId, wrappedDek: rewrapped.ciphertext };
}
