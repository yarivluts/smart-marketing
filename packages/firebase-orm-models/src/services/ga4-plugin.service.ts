import { PluginInstallModel } from '../models/plugin-install.model';
import { SharedCredentialModel } from '../models/shared-credential.model';
import type { KmsProvider } from '../vault';
import {
  GA4_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  GA4_PROPERTY_ID_CONFIG_FIELD,
  parseGa4CredentialSecret,
} from '../plugin-runtime/ga4';
import { listActiveAttachmentsForProject } from './resource-library.service';
import { CredentialSecretNotSetError, revealSharedCredentialSecret } from './vault.service';

/** An install claims to be (or was resolved as) the built-in GA4 plugin, but isn't configured with a usable GA4 credential/property yet — surfaced identically to a "Run now" click regardless of which piece is missing, the same posture `StripeCredentialConfigError` (KAN-49) already established for its own connector. */
export class Ga4CredentialConfigError extends Error {
  constructor(public readonly reason: string) {
    super(`This install is not correctly configured to talk to GA4 yet: ${reason}`);
    this.name = 'Ga4CredentialConfigError';
  }
}

export interface Ga4RuntimeConfig {
  accessToken: string;
  propertyId: string;
}

/**
 * Resolves everything a "Run now" click needs to talk to GA4 for one
 * install: the property id from its own config, plus the access token from
 * an *approved* `credential`-kind resource attachment (KAN-27) whose
 * `SharedCredentialModel.provider` is `'ga4'`, decrypted via the vault
 * (KAN-29). Every failure mode collapses to {@link Ga4CredentialConfigError} —
 * the same "one error, several unconfigured-state causes" posture
 * `resolveStripeCredentialSecret` (KAN-49) already established.
 */
export async function resolveGa4RuntimeConfig(
  organizationId: string,
  projectId: string,
  install: PluginInstallModel,
  kms: KmsProvider,
): Promise<Ga4RuntimeConfig> {
  const propertyId = install.config[GA4_PROPERTY_ID_CONFIG_FIELD];
  if (typeof propertyId !== 'string' || propertyId.trim().length === 0) {
    throw new Ga4CredentialConfigError(`missing "${GA4_PROPERTY_ID_CONFIG_FIELD}" config`);
  }

  const attachmentId = install.config[GA4_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD];
  if (typeof attachmentId !== 'string' || attachmentId.trim().length === 0) {
    throw new Ga4CredentialConfigError(`missing "${GA4_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}" config`);
  }

  const attachments = await listActiveAttachmentsForProject(organizationId, projectId);
  const attachment = attachments.find((entry) => entry.id === attachmentId && entry.resource_kind === 'credential');
  if (!attachment) {
    throw new Ga4CredentialConfigError('no approved credential attachment matches the configured id');
  }

  const credential = await SharedCredentialModel.init(attachment.resource_id, { organization_id: organizationId });
  if (!credential || credential.provider !== 'ga4') {
    throw new Ga4CredentialConfigError('the attached credential is not a GA4 credential');
  }

  try {
    const raw = await revealSharedCredentialSecret({ organizationId, credentialId: attachment.resource_id, kms });
    const { accessToken } = parseGa4CredentialSecret(raw);
    return { accessToken, propertyId };
  } catch (error) {
    if (error instanceof CredentialSecretNotSetError) {
      throw new Ga4CredentialConfigError('the attached GA4 credential has no secret set yet');
    }
    throw error;
  }
}
