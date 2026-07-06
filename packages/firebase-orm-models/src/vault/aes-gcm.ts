import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const AES_GCM_IV_BYTES = 12;
export const AES_GCM_AUTH_TAG_BYTES = 16;

export interface AesGcmSealed {
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

/**
 * Shared low-level AES-256-GCM primitive used by both `envelope.ts` (sealing
 * a secret under its DEK) and `local-kms-provider.ts` (sealing a DEK under a
 * KEK-derived subkey) — one place implementing raw AEAD rather than two
 * independent copies. `aad` (additional authenticated data) is bound into
 * the auth tag: swapping `ciphertext`/`iv`/`authTag` between two different
 * `aad` contexts (e.g. two different credentials) always fails to decrypt.
 */
export function aesGcmSeal(key: Buffer, aad: Buffer, plaintext: Buffer): AesGcmSealed {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, authTag: cipher.getAuthTag(), ciphertext };
}

/** Reverses {@link aesGcmSeal}. Throws if `key`/`aad` don't match, or `iv`/`authTag`/`ciphertext` were tampered with. */
export function aesGcmOpen(key: Buffer, aad: Buffer, sealed: AesGcmSealed): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(sealed.authTag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
}
