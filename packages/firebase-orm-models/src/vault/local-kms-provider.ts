import { createHmac } from 'node:crypto';
import { open, seal } from './envelope';
import type { KmsProvider, WrappedDataKey } from './kms-provider';

export class UnknownKeyVersionError extends Error {
  constructor(keyVersion: string) {
    super(`No master key configured for vault key version "${keyVersion}".`);
    this.name = 'UnknownKeyVersionError';
  }
}

export interface LocalKmsProviderConfig {
  /** Key version -> base64-encoded 32-byte master key. Keep every version a not-yet-rotated secret might still need to unwrap with. */
  masterKeys: Readonly<Record<string, string>>;
  /** Which entry of `masterKeys` new wrap operations use. */
  currentKeyVersion: string;
}

/**
 * Dev/CI-only `KmsProvider`: derives a per-tenant KEK from a versioned master
 * key (`HMAC-SHA256(masterKey, tenantId)`) instead of calling a real Cloud
 * KMS, so every organization's envelope key is distinct without needing one
 * KMS `CryptoKey` provisioned per tenant up front. A real GCP Cloud KMS
 * provider is deferred until KAN-18 provisions an actual GCP project — unlike
 * Firestore/Auth, there is no faithful local emulator for Cloud KMS to verify
 * a real implementation against yet, and `createKmsProviderFromEnv` is the
 * only call site that would need to change to add one later.
 */
export class LocalKmsProvider implements KmsProvider {
  private readonly masterKeys: ReadonlyMap<string, Buffer>;
  public readonly currentKeyVersion: string;

  constructor(config: LocalKmsProviderConfig) {
    this.masterKeys = new Map(
      Object.entries(config.masterKeys).map(([version, key]) => [version, Buffer.from(key, 'base64')]),
    );
    this.currentKeyVersion = config.currentKeyVersion;
    if (!this.masterKeys.has(this.currentKeyVersion)) {
      throw new UnknownKeyVersionError(this.currentKeyVersion);
    }
  }

  private kekFor(tenantId: string, keyVersion: string): Buffer {
    const masterKey = this.masterKeys.get(keyVersion);
    if (!masterKey) {
      throw new UnknownKeyVersionError(keyVersion);
    }
    return createHmac('sha256', masterKey).update(tenantId).digest();
  }

  async wrapDataKey(tenantId: string, dataKey: Buffer, aad?: Buffer): Promise<WrappedDataKey> {
    const kek = this.kekFor(tenantId, this.currentKeyVersion);
    return { ...seal(dataKey, kek, aad), keyVersion: this.currentKeyVersion };
  }

  async unwrapDataKey(tenantId: string, wrapped: WrappedDataKey, aad?: Buffer): Promise<Buffer> {
    const kek = this.kekFor(tenantId, wrapped.keyVersion);
    return open(wrapped, kek, aad);
  }
}
