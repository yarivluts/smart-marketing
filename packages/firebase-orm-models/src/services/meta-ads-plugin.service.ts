import { SharedCredentialModel } from '../models/shared-credential.model';
import type { ResourceAttachmentModel } from '../models/resource-attachment.model';
import type { KmsProvider } from '../vault';
import { parseMetaAdsCredentialSecret, type MetaAdsCredentialSecret } from '../plugin-runtime/meta-ads';
import { CredentialSecretNotSetError, revealSharedCredentialSecret } from './vault.service';

/** An automation target's linked connection claims to (or was resolved as) a Meta Ads credential, but isn't configured with a usable secret yet. */
export class MetaAdsCredentialConfigError extends Error {
  constructor(public readonly reason: string) {
    super(`This connection is not correctly configured to talk to Meta Ads yet: ${reason}`);
    this.name = 'MetaAdsCredentialConfigError';
  }
}

/**
 * Resolves the Meta Ads secret (access token, ad account id, page id) an
 * *approved* `credential`-kind resource attachment (KAN-27) points at,
 * decrypted via the vault (KAN-29). Every failure mode collapses to
 * {@link MetaAdsCredentialConfigError} — the same "one story, one error type"
 * posture `resolveGoogleAdsCredentialSecret` established. Takes the
 * already-loaded `attachment` directly (rather than a `PluginInstallModel`'s
 * config field) since a KAN-71 automation target links straight to a
 * `ResourceAttachmentModel` via `resource_attachment_id` — there is no
 * plugin-install indirection to traverse here.
 */
export async function resolveMetaAdsCredentialSecret(
  organizationId: string,
  attachment: ResourceAttachmentModel,
  kms: KmsProvider,
): Promise<MetaAdsCredentialSecret> {
  if (attachment.resource_kind !== 'credential') {
    throw new MetaAdsCredentialConfigError('the attached resource is not a credential');
  }

  const credential = await SharedCredentialModel.init(attachment.resource_id, { organization_id: organizationId });
  if (!credential || credential.provider !== 'meta_ads') {
    throw new MetaAdsCredentialConfigError('the attached credential is not a Meta Ads credential');
  }

  try {
    const raw = await revealSharedCredentialSecret({ organizationId, credentialId: attachment.resource_id, kms });
    return parseMetaAdsCredentialSecret(raw);
  } catch (error) {
    if (error instanceof CredentialSecretNotSetError) {
      throw new MetaAdsCredentialConfigError('the attached Meta Ads credential has no secret set yet');
    }
    throw error;
  }
}
