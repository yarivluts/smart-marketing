import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AEAD cipher used for both the per-secret data key and the data-key-wrapping ("envelope") layer. */
const AES_ALGORITHM = 'aes-256-gcm';
/** NIST SP 800-38D recommended GCM nonce size. */
const IV_BYTES = 12;
/** AES-256 key size. */
const DATA_KEY_BYTES = 32;

export interface SealedPayload {
  /** Base64 ciphertext. */
  ciphertext: string;
  /** Base64 GCM nonce. */
  iv: string;
  /** Base64 GCM authentication tag — tampering with `ciphertext`/`iv` fails `open()`. */
  authTag: string;
}

/** A fresh, random 256-bit data key. Generate one per secret; never reuse a data key across secrets. */
export function generateDataKey(): Buffer {
  return randomBytes(DATA_KEY_BYTES);
}

/** Encrypts `plaintext` under `key` with a fresh random nonce — safe to call repeatedly with the same key. */
export function seal(plaintext: Buffer, key: Buffer): SealedPayload {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

/** Reverses `seal`. Throws if `key` is wrong or `sealed` was tampered with (GCM authentication failure). */
export function open(sealed: SealedPayload, key: Buffer): Buffer {
  const decipher = createDecipheriv(AES_ALGORITHM, key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]);
}
