import { createKmsProviderFromEnv, generateDataKey, type KmsProvider, open, seal } from '../vault';
import { VaultSecretModel } from '../models/vault-secret.model';

export class VaultSecretNotFoundError extends Error {
  constructor() {
    super('Vault secret not found in this organization.');
    this.name = 'VaultSecretNotFoundError';
  }
}

async function loadVaultSecret(organizationId: string, vaultSecretId: string): Promise<VaultSecretModel> {
  const secret = await VaultSecretModel.init(vaultSecretId, { organization_id: organizationId });
  if (!secret || secret.organization_id !== organizationId) {
    throw new VaultSecretNotFoundError();
  }
  return secret;
}

export interface EncryptSecretParams {
  organizationId: string;
  ownerType: string;
  ownerId: string;
  plaintext: string;
  createdByUserId: string;
  /** Defaults to `createKmsProviderFromEnv()` — injectable so callers/tests can pin a specific provider (e.g. to exercise rotation across two key versions). */
  kmsProvider?: KmsProvider;
}

/**
 * Envelope-encrypts an arbitrary secret for storage in Firestore (KAN-29 AC:
 * "secrets unreadable in Firestore dump"). A fresh, random per-secret data
 * key (DEK) encrypts the plaintext; the DEK itself is then wrapped by a
 * per-tenant KMS key (`KmsProvider`), so:
 *  - the plaintext is never derivable from the stored document alone — the
 *    KEK never touches Firestore, only the wrapped DEK does;
 *  - rotating the KEK (`rotateVaultSecret`) only ever re-wraps the tiny DEK,
 *    never re-encrypts the (potentially large) secret payload — the whole
 *    operational point of envelope encryption.
 */
export async function encryptSecret(params: EncryptSecretParams): Promise<VaultSecretModel> {
  const kmsProvider = params.kmsProvider ?? createKmsProviderFromEnv();
  const dataKey = generateDataKey();
  const sealedSecret = seal(Buffer.from(params.plaintext, 'utf8'), dataKey);
  const wrappedDataKey = await kmsProvider.wrapDataKey(params.organizationId, dataKey);

  const secret = new VaultSecretModel();
  secret.organization_id = params.organizationId;
  secret.owner_type = params.ownerType;
  secret.owner_id = params.ownerId;
  secret.sealed_secret = sealedSecret;
  secret.wrapped_data_key = wrappedDataKey;
  secret.created_by = params.createdByUserId;
  secret.setPathParams({ organization_id: params.organizationId });
  await secret.save();
  return secret;
}

export interface DecryptSecretParams {
  organizationId: string;
  vaultSecretId: string;
  kmsProvider?: KmsProvider;
}

/** Reverses `encryptSecret`, returning the original plaintext. Throws `VaultSecretNotFoundError` for an unknown id or one from a different organization. */
export async function decryptSecret(params: DecryptSecretParams): Promise<string> {
  const secret = await loadVaultSecret(params.organizationId, params.vaultSecretId);
  const kmsProvider = params.kmsProvider ?? createKmsProviderFromEnv();
  const dataKey = await kmsProvider.unwrapDataKey(params.organizationId, secret.wrapped_data_key);
  return open(secret.sealed_secret, dataKey).toString('utf8');
}

export interface RotateVaultSecretParams {
  organizationId: string;
  vaultSecretId: string;
  kmsProvider?: KmsProvider;
}

/**
 * Re-wraps a secret's data key under the KMS provider's *current* key
 * version, without touching the encrypted secret payload at all (KAN-29 AC:
 * "rotation test passes"). This is the operational benefit of envelope
 * encryption: rotating the org's KEK doesn't require re-encrypting every
 * secret it protects, only the (tiny) wrapped data keys — `sealed_secret` is
 * left completely untouched by a rotation.
 */
export async function rotateVaultSecret(params: RotateVaultSecretParams): Promise<VaultSecretModel> {
  const secret = await loadVaultSecret(params.organizationId, params.vaultSecretId);
  const kmsProvider = params.kmsProvider ?? createKmsProviderFromEnv();
  const dataKey = await kmsProvider.unwrapDataKey(params.organizationId, secret.wrapped_data_key);
  secret.wrapped_data_key = await kmsProvider.wrapDataKey(params.organizationId, dataKey);
  secret.rotated_at = new Date().toISOString();
  await secret.save();
  return secret;
}
