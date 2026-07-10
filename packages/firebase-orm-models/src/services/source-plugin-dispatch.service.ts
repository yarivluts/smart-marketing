import type { PluginSourceRunModel } from '../models/plugin-source-run.model';
import type { KmsProvider } from '../vault';
import { STRIPE_PLUGIN_ID, StripeHttpApiClient, StripeSourcePluginExecutor, ensureStripeCommerceSchemasRegistered } from '../plugin-runtime/stripe';
import { GA4_PLUGIN_ID, Ga4HttpApiClient, Ga4SourcePluginExecutor, ensureGa4SchemasRegistered } from '../plugin-runtime/ga4';
import type { SourcePluginExecutor } from '../plugin-runtime';
import { getPluginInstall } from './plugin-registry.service';
import { resolveStripeCredentialSecret, StripeCredentialConfigError } from './stripe-plugin.service';
import { Ga4CredentialConfigError, resolveGa4RuntimeConfig } from './ga4-plugin.service';
import { triggerSourcePluginRun, type TriggerSourcePluginRunParams } from './plugin-runtime.service';

export interface RunSourcePluginInstallParams extends TriggerSourcePluginRunParams {
  /** Only consulted for the built-in Stripe or GA4 plugins — every other install ignores it. */
  kms?: KmsProvider;
}

/**
 * The one "Run now" entry point every caller (apps/web's run route, tests)
 * goes through, regardless of which plugin is installed. Transparently
 * builds a real executor against the live provider API for either built-in
 * connector — `StripeSourcePluginExecutor` (KAN-49) or `Ga4SourcePluginExecutor`
 * (KAN-52), resolving each one's own configured credential first — and falls
 * through to the generic KAN-47 toy-executor runtime for every other plugin,
 * unchanged. Split out of `stripe-plugin.service.ts` once a second built-in
 * connector needed the same seam, so neither connector's own service file
 * has to know about the other.
 */
export async function runSourcePluginInstall(params: RunSourcePluginInstallParams): Promise<PluginSourceRunModel> {
  const install = await getPluginInstall(params.organizationId, params.projectId, params.installId);

  if (install && install.plugin_id === STRIPE_PLUGIN_ID && install.status === 'installed') {
    if (!params.kms) {
      throw new StripeCredentialConfigError('no KMS provider was supplied to resolve its credential');
    }
    const { apiSecretKey } = await resolveStripeCredentialSecret(params.organizationId, params.projectId, install, params.kms);
    const executor: SourcePluginExecutor = new StripeSourcePluginExecutor({ apiClient: new StripeHttpApiClient(apiSecretKey) });

    if (params.triggeredByUserId) {
      await ensureStripeCommerceSchemasRegistered(params.organizationId, params.projectId, params.triggeredByUserId);
    }

    return triggerSourcePluginRun({ ...params, executor, precomputedInstall: install });
  }

  if (install && install.plugin_id === GA4_PLUGIN_ID && install.status === 'installed') {
    if (!params.kms) {
      throw new Ga4CredentialConfigError('no KMS provider was supplied to resolve its credential');
    }
    const { accessToken, propertyId } = await resolveGa4RuntimeConfig(params.organizationId, params.projectId, install, params.kms);
    const executor: SourcePluginExecutor = new Ga4SourcePluginExecutor({ apiClient: new Ga4HttpApiClient(accessToken), propertyId });

    if (params.triggeredByUserId) {
      await ensureGa4SchemasRegistered(params.organizationId, params.projectId, params.triggeredByUserId);
    }

    return triggerSourcePluginRun({ ...params, executor, precomputedInstall: install });
  }

  // `install` is `null` for a genuinely nonexistent install (falls through to
  // triggerSourcePluginRun's own 404) — passing `undefined` there is exactly its own default.
  return triggerSourcePluginRun({ ...params, precomputedInstall: install ?? undefined });
}
