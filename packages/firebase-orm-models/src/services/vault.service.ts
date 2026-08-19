import { decryptSecret, encryptSecret, rotateSecretEnvelopeKey } from '../vault/envelope';
import type { KmsProvider } from '../vault/kms-provider';
import { SharedCredentialModel } from '../models/shared-credential.model';
import { recordAuditLogEntry } from './audit-log.service';

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

/**
 * The envelope's tenant-binding id: organization *and* credential, not just
 * the organization. Binding to the specific credential (not only its org)
 * means a bug that fed one credential's `encrypted_secret` into
 * `decryptSecret`/`rotateSecretEnvelopeKey` under a *different* credential's
 * id in the same org fails closed instead of silently succeeding.
 */
function credentialBindingId(organizationId: string, credentialId: string): string {
  return `${organizationId}:${credentialId}`;
}

export interface SetSharedCredentialSecretParams {
  organizationId: string;
  credentialId: string;
  secret: string;
  kms: KmsProvider;
  /** The acting admin, recorded on the org's audit-log chain (KAN-44). */
  actorId: string;
}

/**
 * Envelope-encrypts `secret` and stores it on the credential (KAN-29). The
 * organization+credential id is the binding the KMS wrap and the envelope's
 * own AES-GCM auth tag are both bound to — see `envelope.ts` — so this same
 * ciphertext can never be decrypted under a different organization, or even
 * a different credential in the same organization, by a bug that passed the
 * wrong id elsewhere.
 */
export async function setSharedCredentialSecret(params: SetSharedCredentialSecretParams): Promise<SharedCredentialModel> {
  const credential = await requireSharedCredentialInOrg(params.organizationId, params.credentialId);
  const replacedExistingSecret = Boolean(credential.encrypted_secret);
  credential.encrypted_secret = await encryptSecret(
    params.secret,
    credentialBindingId(params.organizationId, params.credentialId),
    params.kms,
  );
  await credential.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.actorId,
      action: 'credential.secret_set',
      targetType: 'shared_credential',
      targetId: credential.id,
      summary: replacedExistingSecret
        ? `Replaced the stored secret for credential "${credential.name}"`
        : `Set the stored secret for credential "${credential.name}"`,
      // Only ever the *presence* of a secret, never the secret or its ciphertext:
      // an audit trail readable by every `audit.read` holder must not become a
      // second, weaker copy of the vault it is auditing.
      before: { hasSecret: replacedExistingSecret },
      after: { hasSecret: true },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return credential;
}

export interface RevealSharedCredentialSecretParams {
  organizationId: string;
  credentialId: string;
  kms: KmsProvider;
}

/**
 * Decrypts a credential's stored secret. Intended for server-side connector
 * use (KAN-49/50/51), never for returning to a browser.
 *
 * Deliberately not audit-logged, unlike its set/rotate siblings: KAN-44 scopes
 * the trail to config *changes*, and this runs on every plugin sync — logging
 * it would bury real config changes under machine traffic. Auditing secret
 * *reads* is a separate concern needing its own retention story.
 */
export async function revealSharedCredentialSecret(params: RevealSharedCredentialSecretParams): Promise<string> {
  const credential = await requireSharedCredentialInOrg(params.organizationId, params.credentialId);
  if (!credential.encrypted_secret) {
    throw new CredentialSecretNotSetError();
  }
  return decryptSecret(credential.encrypted_secret, credentialBindingId(params.organizationId, params.credentialId), params.kms);
}

export interface RotateSharedCredentialSecretKeyParams {
  organizationId: string;
  credentialId: string;
  kms: KmsProvider;
  /** The acting admin, recorded on the org's audit-log chain (KAN-44). */
  actorId: string;
}

/** Re-wraps a credential's stored secret under the KMS provider's current key (KAN-29 "rotation test passes" AC). A no-op — including no Firestore write — if it's already current. */
export async function rotateSharedCredentialSecretKey(
  params: RotateSharedCredentialSecretKeyParams,
): Promise<SharedCredentialModel> {
  const credential = await requireSharedCredentialInOrg(params.organizationId, params.credentialId);
  if (!credential.encrypted_secret) {
    throw new CredentialSecretNotSetError();
  }
  const rotated = await rotateSecretEnvelopeKey(
    credential.encrypted_secret,
    credentialBindingId(params.organizationId, params.credentialId),
    params.kms,
  );
  const rewrapped = rotated !== credential.encrypted_secret;
  if (rewrapped) {
    credential.encrypted_secret = rotated;
    await credential.save();
  }

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.actorId,
      action: 'credential.secret_rotate',
      targetType: 'shared_credential',
      targetId: credential.id,
      // Recorded even when the envelope was already current: an admin
      // deliberately invoking key rotation is itself the audited event, and a
      // silent no-op would leave "I rotated that key" unprovable. `rewrapped`
      // is what distinguishes the two outcomes.
      summary: rewrapped
        ? `Rotated the envelope key for credential "${credential.name}"`
        : `Ran key rotation for credential "${credential.name}" (already current, no re-wrap needed)`,
      after: { rewrapped },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return credential;
}
