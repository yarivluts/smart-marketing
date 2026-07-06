import type { SealedPayload } from './envelope';

export interface WrappedDataKey extends SealedPayload {
  /** Which KMS key version wrapped this data key — lets a rotation re-wrap under a newer version without touching the payload it protects. */
  keyVersion: string;
}

/**
 * Wraps/unwraps per-secret data keys under a tenant-scoped key-encryption key
 * (KEK) — the "envelope" half of envelope encryption (KAN-29; plan
 * `01 §architecture`/`06 §4`: "OAuth tokens & API keys encrypted with
 * per-tenant KMS envelope keys"). An implementation never sees the secret
 * payload itself, only the tiny data key that protects it — that's what
 * makes KEK rotation cheap: rotating re-wraps a 32-byte key, not the
 * (potentially large) payload it protects.
 */
export interface KmsProvider {
  /** The key version any new `wrapDataKey` call will use. */
  readonly currentKeyVersion: string;
  wrapDataKey(tenantId: string, dataKey: Buffer): Promise<WrappedDataKey>;
  unwrapDataKey(tenantId: string, wrapped: WrappedDataKey): Promise<Buffer>;
}
