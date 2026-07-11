import type { PluginInstallModel } from '../models/plugin-install.model';
import { ensureSaasMetricPackRegistered, SAAS_METRIC_PACK_PLUGIN_ID } from '../plugin-runtime/saas-metric-pack';
import { installPlugin, type InstallPluginParams } from './plugin-registry.service';

/**
 * The one "install" entry point every caller (apps/web's install route,
 * tests) should go through, regardless of which plugin is being installed —
 * mirrors `source-plugin-dispatch.service.ts`'s `runSourcePluginInstall`
 * seam, but at install time rather than run time. The built-in SaaS/
 * marketing metric pack (KAN-59) has no sync/run concept — its manifest
 * declares `registers.metrics` but no `endpoints.sync` — so "installing the
 * pack registers all its metrics" (plan `13 §E11.1`) has to happen here,
 * right after install, rather than on a "Run now" click the way Stripe/GA4's
 * schema self-provisioning does. `installPlugin` itself
 * (`plugin-registry.service.ts`) stays fully generic, with zero knowledge of
 * any specific built-in plugin id — this dispatch layer is where that
 * knowledge lives, same as the source-plugin dispatch above it. Every plugin
 * id other than the built-in metric pack falls through to the generic
 * `installPlugin` unchanged.
 */
export async function installPluginAndProvisionBuiltins(params: InstallPluginParams): Promise<PluginInstallModel> {
  const install = await installPlugin(params);

  if (install.plugin_id === SAAS_METRIC_PACK_PLUGIN_ID) {
    await ensureSaasMetricPackRegistered(params.organizationId, params.projectId, params.installedByUserId);
  }

  return install;
}
