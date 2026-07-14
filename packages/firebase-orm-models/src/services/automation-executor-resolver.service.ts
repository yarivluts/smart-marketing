import { AutomationTargetStateModel } from '../models/automation-target-state.model';
import { ResourceAttachmentModel } from '../models/resource-attachment.model';
import { SharedCredentialModel } from '../models/shared-credential.model';
import { defaultAutomationActionExecutor, type AutomationActionExecutor } from '../automation-runtime';
import { GoogleAdsAutomationActionExecutor, GoogleAdsHttpApiClient, GOOGLE_ADS_MANAGE_PLUGIN_ID } from '../plugin-runtime/google-ads';
import type { KmsProvider } from '../vault';
import { listPluginInstallsForProject } from './plugin-registry.service';
import { resolveGoogleAdsCredentialSecret, GoogleAdsCredentialConfigError } from './google-ads-plugin.service';

/** A target is linked to an approved Google Ads credential, but the project hasn't installed (and enabled) the Google Ads Manage plugin — the org-level "I consent to `action:execute`" formality KAN-46's install flow exists for. */
export class GoogleAdsPluginNotInstalledError extends Error {
  constructor() {
    super('The Google Ads Manage plugin must be installed and enabled for this project before its connections can execute automation actions.');
    this.name = 'GoogleAdsPluginNotInstalledError';
  }
}

/**
 * Resolves which {@link AutomationActionExecutor} `executeAutomationAction`/
 * `rollbackAutomationAction` should use for a given target (KAN-72) — a real
 * `GoogleAdsAutomationActionExecutor` when the target's linked connection
 * (`AutomationTargetStateModel.resource_attachment_id`) is an approved
 * `provider: 'google_ads'` credential *and* the project has the Google Ads
 * Manage plugin installed+enabled, otherwise the
 * `SimulatedAdAccountExecutor` every target used before this story existed.
 * Kept out of `automation.service.ts` itself so that module stays
 * provider-agnostic (it only ever sees the `AutomationActionExecutor`
 * interface) — this resolver is the one place that knows Google Ads exists,
 * called from `apps/web`'s execute/rollback mutation wrappers before
 * invoking the service, the same "caller resolves, service stays generic"
 * split the service's own `executor?` parameter already implies.
 *
 * Deliberately does **not** silently fall back to the simulated executor
 * once a target is confirmed linked to a Google Ads credential — a
 * misconfigured/unset secret (or a deployment with no vault configured,
 * `kms` omitted, the same "resolved best-effort" posture the `plugins/[installId]/run`
 * route already uses for Stripe/GA4) throws {@link GoogleAdsCredentialConfigError}
 * rather than quietly "executing" against a fake backend, since that would
 * be actively misleading for a Manage-tier action mutating a real ad
 * account.
 */
export async function resolveAutomationActionExecutorForTarget(
  organizationId: string,
  projectId: string,
  targetId: string,
  kms: KmsProvider | undefined,
): Promise<AutomationActionExecutor> {
  const target = await AutomationTargetStateModel.init(targetId, { organization_id: organizationId, project_id: projectId });
  if (!target || target.project_id !== projectId || !target.resource_attachment_id) {
    return defaultAutomationActionExecutor;
  }

  const attachment = await ResourceAttachmentModel.init(target.resource_attachment_id, { organization_id: organizationId });
  if (!attachment || attachment.project_id !== projectId || attachment.resource_kind !== 'credential' || attachment.status !== 'approved') {
    return defaultAutomationActionExecutor;
  }

  const credential = await SharedCredentialModel.init(attachment.resource_id, { organization_id: organizationId });
  if (!credential || credential.provider !== 'google_ads') {
    return defaultAutomationActionExecutor;
  }

  const installs = await listPluginInstallsForProject(organizationId, projectId);
  const installed = installs.some((install) => install.plugin_id === GOOGLE_ADS_MANAGE_PLUGIN_ID && install.status === 'installed');
  if (!installed) {
    throw new GoogleAdsPluginNotInstalledError();
  }
  if (!kms) {
    throw new GoogleAdsCredentialConfigError('the vault is not configured on this deployment');
  }

  const secret = await resolveGoogleAdsCredentialSecret(organizationId, attachment, kms);
  const apiClient = new GoogleAdsHttpApiClient({
    developerToken: secret.developerToken,
    clientId: secret.clientId,
    clientSecret: secret.clientSecret,
    refreshToken: secret.refreshToken,
    ...(secret.loginCustomerId ? { loginCustomerId: secret.loginCustomerId } : {}),
  });
  return new GoogleAdsAutomationActionExecutor(apiClient, secret.customerId);
}
