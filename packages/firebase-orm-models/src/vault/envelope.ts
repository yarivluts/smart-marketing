import { randomBytes } from 'node:crypto';
import { aesGcmOpen, aesGcmSeal } from './aes-gcm';
import type { KmsProvider } from './kms-provider';

const DEK_BYTES = 32;

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
 * wraps that DEK with the KMS provider's current key. `tenantId` (callers
 * bind this to an organization id, or an organization+record id compound for
 * finer-grained isolation) both derives the KMS wrapping key *and* is bound
 * into this envelope's own AES-GCM auth tag as additional authenticated
 * data — decrypting with a different `tenantId` always fails, whether the
 * mismatch happens at the KMS-unwrap step or here, which is what makes
 * cross-tenant decryption structurally impossible rather than merely
 * disallowed by application code.
 */
export async function encryptSecret(plaintext: string, tenantId: string, kms: KmsProvider): Promise<SecretEnvelope> {
  const dek = randomBytes(DEK_BYTES);
  const sealed = aesGcmSeal(dek, Buffer.from(tenantId, 'utf8'), Buffer.from(plaintext, 'utf8'));
  const wrapped = await kms.wrapDek(dek, tenantId);
  dek.fill(0);

  return {
    keyId: wrapped.keyId,
    wrappedDek: wrapped.ciphertext,
    iv: sealed.iv.toString('base64'),
    authTag: sealed.authTag.toString('base64'),
    ciphertext: sealed.ciphertext.toString('base64'),
  };
}

/** Reverses {@link encryptSecret}. Throws if `tenantId` doesn't match the one the envelope was encrypted under, or if the ciphertext/auth tag has been tampered with. */
export async function decryptSecret(envelope: SecretEnvelope, tenantId: string, kms: KmsProvider): Promise<string> {
  const dek = await kms.unwrapDek({ keyId: envelope.keyId, ciphertext: envelope.wrappedDek }, tenantId);
  const plaintext = aesGcmOpen(dek, Buffer.from(tenantId, 'utf8'), {
    iv: Buffer.from(envelope.iv, 'base64'),
    authTag: Buffer.from(envelope.authTag, 'base64'),
    ciphertext: Buffer.from(envelope.ciphertext, 'base64'),
  });
  dek.fill(0);
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
