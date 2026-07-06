import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { KmsProvider, WrappedDek } from './kms-provider';

const KEK_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_AUTH_TAG_BYTES = 16;

export class UnknownKmsKeyError extends Error {
  constructor(keyId: string) {
    super(`No KMS key registered for key id "${keyId}" — it may have been retired past its rotation window.`);
    this.name = 'UnknownKmsKeyError';
  }
}

export class VaultNotConfiguredError extends Error {
  constructor(reason: string) {
    super(`Vault KMS key ring is not configured: ${reason}. Set GROWTHOS_VAULT_KEYS.`);
    this.name = 'VaultNotConfiguredError';
  }
}

/** Every versioned key-encryption-key (KEK) this provider can wrap/unwrap with, e.g. `{ v1: <32 random bytes> }`. */
export type LocalKmsKeyRing = Readonly<Record<string, Buffer>>;

/** A fresh single-key ring — for tests and local dev only; nothing production reads this. */
export function generateLocalKmsKeyRing(keyId = 'v1'): { keyRing: LocalKmsKeyRing; currentKeyId: string } {
  return { keyRing: { [keyId]: randomBytes(KEK_BYTES) }, currentKeyId: keyId };
}

/**
 * Loads a key ring from the `GROWTHOS_VAULT_KEYS` env var — a JSON object
 * `{"currentKeyId": "v2", "keys": {"v1": "<base64 32 bytes>", "v2": "..."}}`.
 * This is the stand-in for a real secret store (GCP Secret Manager /
 * Cloud KMS key ring, per plan `06 §6`) until KAN-18 provisions the GCP
 * project it would live in — the same "buildable today" split KAN-28 used
 * for its own key hashing.
 */
export function loadLocalKmsKeyRingFromEnv(env: NodeJS.ProcessEnv = process.env): {
  keyRing: LocalKmsKeyRing;
  currentKeyId: string;
} {
  const raw = env.GROWTHOS_VAULT_KEYS;
  if (!raw) {
    throw new VaultNotConfiguredError('GROWTHOS_VAULT_KEYS is unset');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VaultNotConfiguredError('GROWTHOS_VAULT_KEYS is not valid JSON');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { currentKeyId?: unknown }).currentKeyId !== 'string' ||
    typeof (parsed as { keys?: unknown }).keys !== 'object' ||
    (parsed as { keys?: unknown }).keys === null
  ) {
    throw new VaultNotConfiguredError('GROWTHOS_VAULT_KEYS must be {"currentKeyId": string, "keys": {[id]: base64}}');
  }

  const { currentKeyId, keys } = parsed as { currentKeyId: string; keys: Record<string, unknown> };
  const keyRing: Record<string, Buffer> = {};
  for (const [keyId, value] of Object.entries(keys)) {
    if (typeof value !== 'string') {
      throw new VaultNotConfiguredError(`GROWTHOS_VAULT_KEYS.keys["${keyId}"] must be a base64 string`);
    }
    const key = Buffer.from(value, 'base64');
    if (key.length !== KEK_BYTES) {
      throw new VaultNotConfiguredError(`GROWTHOS_VAULT_KEYS.keys["${keyId}"] must decode to ${KEK_BYTES} bytes`);
    }
    keyRing[keyId] = key;
  }

  return { keyRing, currentKeyId };
}

/**
 * Stands in for a real GCP Cloud KMS key ring (see `KmsProvider`'s doc
 * comment). Every KEK in the ring is deliberately never used to encrypt
 * data directly: each `wrapDek`/`unwrapDek` call first derives a
 * *per-tenant* subkey via HKDF (the KEK as input key material, the tenant
 * id as salt) so that two tenants' wrapped DEKs are cryptographically
 * unrelated even under the same KEK version — "no cross-tenant code path"
 * (plan `06 §6`) is structural here, not just an application-level check.
 */
export class LocalKmsProvider implements KmsProvider {
  private readonly keyRing: LocalKmsKeyRing;

  public readonly currentKeyId: string;

  constructor(keyRing: LocalKmsKeyRing, currentKeyId: string) {
    if (!keyRing[currentKeyId]) {
      throw new UnknownKmsKeyError(currentKeyId);
    }
    this.keyRing = keyRing;
    this.currentKeyId = currentKeyId;
  }

  async wrapDek(plaintextDek: Buffer, tenantId: string): Promise<WrappedDek> {
    const kek = this.keyRing[this.currentKeyId];
    return { keyId: this.currentKeyId, ciphertext: seal(kek, tenantId, plaintextDek) };
  }

  async unwrapDek(wrapped: WrappedDek, tenantId: string): Promise<Buffer> {
    const kek = this.keyRing[wrapped.keyId];
    if (!kek) {
      throw new UnknownKmsKeyError(wrapped.keyId);
    }
    return open(kek, tenantId, wrapped.ciphertext);
  }
}

function tenantSubkey(kek: Buffer, tenantId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', kek, Buffer.alloc(0), Buffer.from(tenantId, 'utf8'), KEK_BYTES));
}

function seal(kek: Buffer, tenantId: string, plaintext: Buffer): string {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', tenantSubkey(kek, tenantId), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

function open(kek: Buffer, tenantId: string, sealed: string): Buffer {
  const raw = Buffer.from(sealed, 'base64');
  const iv = raw.subarray(0, GCM_IV_BYTES);
  const authTag = raw.subarray(GCM_IV_BYTES, GCM_IV_BYTES + GCM_AUTH_TAG_BYTES);
  const ciphertext = raw.subarray(GCM_IV_BYTES + GCM_AUTH_TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', tenantSubkey(kek, tenantId), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
