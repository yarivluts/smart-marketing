import { SharedCredentialModel } from '../models/shared-credential.model';
import type { ResourceAttachmentModel } from '../models/resource-attachment.model';
import type { KmsProvider } from '../vault';
import { parseGoogleAdsCredentialSecret, type GoogleAdsCredentialSecret } from '../plugin-runtime/google-ads';
import { CredentialSecretNotSetError, revealSharedCredentialSecret } from './vault.service';

/** An automation target's linked connection claims to (or was resolved as) a Google Ads credential, but isn't configured with a usable secret yet. */
export class GoogleAdsCredentialConfigError extends Error {
  constructor(public readonly reason: string) {
    super(`This connection is not correctly configured to talk to Google Ads yet: ${reason}`);
    this.name = 'GoogleAdsCredentialConfigError';
  }
}

/**
 * Resolves the Google Ads secret (OAuth app credentials, refresh token,
 * developer token, target customer id) an *approved* `credential`-kind
 * resource attachment (KAN-27) points at, decrypted via the vault (KAN-29).
 * Every failure mode collapses to {@link GoogleAdsCredentialConfigError} — the
 * same "one story, one error type" posture `resolveStripeCredentialSecret`
 * established. Takes the already-loaded `attachment` directly (rather than a
 * `PluginInstallModel`'s config field, the way Stripe resolves it) since a
 * KAN-71 automation target links straight to a `ResourceAttachmentModel` via
 * `resource_attachment_id` — there is no plugin-install indirection to
 * traverse here.
 */
export async function resolveGoogleAdsCredentialSecret(
  organizationId: string,
  attachment: ResourceAttachmentModel,
  kms: KmsProvider,
): Promise<GoogleAdsCredentialSecret> {
  if (attachment.resource_kind !== 'credential') {
    throw new GoogleAdsCredentialConfigError('the attached resource is not a credential');
  }

  const credential = await SharedCredentialModel.init(attachment.resource_id, { organization_id: organizationId });
  if (!credential || credential.provider !== 'google_ads') {
    throw new GoogleAdsCredentialConfigError('the attached credential is not a Google Ads credential');
  }

  try {
    const raw = await revealSharedCredentialSecret({ organizationId, credentialId: attachment.resource_id, kms });
    return parseGoogleAdsCredentialSecret(raw);
  } catch (error) {
    if (error instanceof CredentialSecretNotSetError) {
      throw new GoogleAdsCredentialConfigError('the attached Google Ads credential has no secret set yet');
    }
    throw error;
  }
}
