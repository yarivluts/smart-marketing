import { decryptSecret, encryptSecret, rotateSecretEnvelopeKey } from '../vault/envelope';
import type { KmsProvider } from '../vault/kms-provider';
import { SharedCredentialModel } from '../models/shared-credential.model';

export class SharedCredentialNotFoundError extends Error {
  constructor() {
    super('Shared credential not found in this organization.');
    this.name = 'SharedCredentialNotFoundError';
  }
}

export class CredentialSecretNotSetError extends Error {
  constructor() {
    super('This credential has no secret set yet.');
    this.name = 'CredentialSecretNotSetError';
  }
}

async function requireSharedCredentialInOrg(organizationId: string, credentialId: string): Promise<SharedCredentialModel> {
  const credential = await SharedCredentialModel.init(credentialId, { organization_id: organizationId });
  if (!credential || credential.organization_id !== organizationId) {
    throw new SharedCredentialNotFoundError();
  }
  return credential;
}

export interface SetSharedCredentialSecretParams {
  organizationId: string;
  credentialId: string;
  secret: string;
  kms: KmsProvider;
}

/**
 * Envelope-encrypts `secret` and stores it on the credential (KAN-29). The
 * organization id is the tenant boundary the KMS wrap is bound to — see
 * `envelope.ts` — so this same ciphertext can never be decrypted under a
 * different organization's context, even by a bug that passed the wrong
 * `organizationId` elsewhere.
 */
export async function setSharedCredentialSecret(params: SetSharedCredentialSecretParams): Promise<SharedCredentialModel> {
  const credential = await requireSharedCredentialInOrg(params.organizationId, params.credentialId);
  credential.encrypted_secret = await encryptSecret(params.secret, params.organizationId, params.kms);
  await credential.save();
  return credential;
}

export interface RevealSharedCredentialSecretParams {
  organizationId: string;
  credentialId: string;
  kms: KmsProvider;
}

/** Decrypts a credential's stored secret. Intended for server-side connector use (KAN-49/50/51), never for returning to a browser. */
export async function revealSharedCredentialSecret(params: RevealSharedCredentialSecretParams): Promise<string> {
  const credential = await requireSharedCredentialInOrg(params.organizationId, params.credentialId);
  if (!credential.encrypted_secret) {
    throw new CredentialSecretNotSetError();
  }
  return decryptSecret(credential.encrypted_secret, params.organizationId, params.kms);
}

export interface RotateSharedCredentialSecretKeyParams {
  organizationId: string;
  credentialId: string;
  kms: KmsProvider;
}

/** Re-wraps a credential's stored secret under the KMS provider's current key (KAN-29 "rotation test passes" AC). A no-op if it's already current. */
export async function rotateSharedCredentialSecretKey(
  params: RotateSharedCredentialSecretKeyParams,
): Promise<SharedCredentialModel> {
  const credential = await requireSharedCredentialInOrg(params.organizationId, params.credentialId);
  if (!credential.encrypted_secret) {
    throw new CredentialSecretNotSetError();
  }
  credential.encrypted_secret = await rotateSecretEnvelopeKey(credential.encrypted_secret, params.organizationId, params.kms);
  await credential.save();
  return credential;
}
