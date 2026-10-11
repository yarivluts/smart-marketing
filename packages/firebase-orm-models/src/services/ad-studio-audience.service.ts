import { metaTargetingIssues, normalizeMetaTargeting, type AdStudioMetaTargeting, type AdStudioTargetingIssueCode } from '@growthos/shared';
import { SharedCredentialModel } from '../models/shared-credential.model';
import type { AdStudioBriefModel } from '../models/ad-studio.model';
import type { KmsProvider } from '../vault/kms-provider';
import { UnknownKmsKeyError } from '../vault/local-kms-provider';
import { SecretDecryptionError } from '../vault/aes-gcm';
import { InvalidMetaAdsCredentialSecretError, parseMetaAdsCredentialSecret } from '../plugin-runtime/meta-ads';
import { listActiveAttachmentsForProject } from './resource-library.service';
import { revealSharedCredentialSecret } from './vault.service';
import { getAdStudioBrief } from './ad-studio.service';

/**
 * The Meta side of Ad Studio's audience planning: which Meta ad account the project's audience
 * lookups read from, and the targeting saved on an ad.
 */

export type AdStudioMetaReadUnavailable = 'no_meta_credential' | 'credential_not_configured' | 'vault_not_configured';

export type AdStudioMetaReadCredential =
  | { status: 'ok'; accessToken: string; adAccountId: string }
  | { status: 'unavailable'; reason: AdStudioMetaReadUnavailable };

/**
 * The access token and ad account of the project's attached Meta credential, decrypted in memory
 * for a read-only lookup (audiences, interests, reach, past results). Any approved attachment will
 * do - reading needs no write tier. `kms` is null when the deployment has no vault.
 */
export async function resolveAdStudioMetaReadCredential(organizationId: string, projectId: string, kms: KmsProvider | null): Promise<AdStudioMetaReadCredential> {
  const attachments = (await listActiveAttachmentsForProject(organizationId, projectId)).filter((attachment) => attachment.resource_kind === 'credential');
  let withoutSecret = false;
  for (const attachment of attachments) {
    const credential = await SharedCredentialModel.init(attachment.resource_id, { organization_id: organizationId });
    if (!credential || credential.provider !== 'meta_ads') continue;
    if (!credential.encrypted_secret) {
      withoutSecret = true;
      continue;
    }
    if (!kms) return { status: 'unavailable', reason: 'vault_not_configured' };
    try {
      const secret = parseMetaAdsCredentialSecret(await revealSharedCredentialSecret({ organizationId, credentialId: credential.id, kms }));
      return { status: 'ok', accessToken: secret.accessToken, adAccountId: secret.adAccountId };
    } catch (error) {
      // A secret this deployment cannot read (another key ring) or that is malformed: say so, never fail the page.
      if (error instanceof InvalidMetaAdsCredentialSecretError || error instanceof UnknownKmsKeyError || error instanceof SecretDecryptionError) {
        return { status: 'unavailable', reason: 'credential_not_configured' };
      }
      throw error;
    }
  }
  return { status: 'unavailable', reason: withoutSecret ? 'credential_not_configured' : 'no_meta_credential' };
}

export class AdStudioTargetingInvalidError extends Error {
  constructor(public readonly issues: AdStudioTargetingIssueCode[]) {
    super(`The audience targeting breaks these rules: ${issues.join(', ')}`);
    this.name = 'AdStudioTargetingInvalidError';
  }
}

/** Saves the Meta audience an ad is planned for, or clears it with null. */
export async function saveAdStudioMetaTargeting(params: { organizationId: string; projectId: string; briefId: string; targeting: AdStudioMetaTargeting | null; now?: Date }): Promise<AdStudioBriefModel> {
  const value = params.targeting ? normalizeMetaTargeting(params.targeting) : null;
  if (value) {
    const issues = metaTargetingIssues(value);
    if (issues.length) throw new AdStudioTargetingInvalidError(issues);
  }
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  brief.meta_targeting = value;
  brief.last_changed_on = (params.now ?? new Date()).toISOString();
  await brief.save();
  return brief;
}
