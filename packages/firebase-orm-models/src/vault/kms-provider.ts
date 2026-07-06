/** A data-encryption-key, wrapped by a KMS-managed key. Never holds a plaintext key. */
export interface WrappedDek {
  /** Which KMS key (id/version) wrapped this DEK — needed to unwrap, and to tell a stale envelope apart from a current one during rotation. */
  keyId: string;
  /** Opaque, base64-encoded ciphertext of the DEK. */
  ciphertext: string;
}

/**
 * A key-management-service boundary (KAN-29: plan `06 §6`, `08 §5.3`
 * "credential vault ... per-tenant KMS envelope keys"). `envelope.ts` never
 * encrypts a secret directly with a KMS key — it always generates a random
 * per-secret data-encryption-key (DEK), encrypts the secret with that, and
 * only asks a `KmsProvider` to wrap/unwrap the (much smaller) DEK. That's
 * what makes key rotation cheap: rotating means re-wrapping DEKs, never
 * re-encrypting the secrets themselves.
 *
 * `LocalKmsProvider` is the implementation available today. A
 * `GcpKmsProvider` calling real Cloud KMS is a drop-in swap behind this same
 * interface once KAN-18 provisions the GCP project it needs — nothing in
 * `envelope.ts` or `vault.service.ts` would need to change.
 */
export interface KmsProvider {
  /** The key id newly-wrapped DEKs are wrapped under right now. An envelope whose `keyId` differs from this is due for rotation. */
  readonly currentKeyId: string;
  wrapDek(plaintextDek: Buffer, tenantId: string): Promise<WrappedDek>;
  unwrapDek(wrapped: WrappedDek, tenantId: string): Promise<Buffer>;
}
