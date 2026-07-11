import type { PluginInstallModel } from '../models/plugin-install.model';
import { ensureSaasMetricPackDefaultBoardsSeeded, ensureSaasMetricPackRegistered, SAAS_METRIC_PACK_PLUGIN_ID } from '../plugin-runtime/saas-metric-pack';
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
 *
 * Also seeds this pack's three default boards (KAN-61, plan `13 §E11.3`:
 * "New project with pack installed shows populated boards after first
 * sync") via `ensureSaasMetricPackDefaultBoardsSeeded` — strictly *after*
 * `ensureSaasMetricPackRegistered`, since every default board's tiles
 * reference metric names that must already be active in the project's
 * catalog (`saveBoardTiles` rejects a tile referencing an unregistered
 * metric).
 *
 * Not transactional, the same documented, deliberately-deferred tradeoff
 * `registerMetricDefinition`/`registerSchemaDefinition` already accept: the
 * install is saved *before* `ensureSaasMetricPackRegistered`/
 * `ensureSaasMetricPackDefaultBoardsSeeded` run, so a failure partway
 * through (a transient Firestore error, not the expected
 * `DuplicateMetricDefinitionError` path, which is swallowed) leaves an
 * `installed` `PluginInstallModel` with only some of its metrics/boards
 * provisioned, and a re-POST to install the same plugin id in the same
 * project throws `PluginAlreadyInstalledError` rather than resuming — there
 * is no retry surface yet. `ensureSaasMetricPackRegistered` is fully
 * retry-safe (each metric is one atomic write, so a human can uninstall and
 * reinstall to converge on all seventeen registered). Board seeding is
 * *not* equally retry-safe, and `uninstallPlugin` only flips the install's
 * own `status` — it never deletes what got provisioned: if
 * `ensureSaasMetricPackDefaultBoardsSeeded` creates a board but then fails
 * before `saveBoardTiles` populates it (see that function's own doc comment
 * on its name-keyed idempotency), that board is stuck empty forever — a
 * reinstall's name check sees it already exists and skips it, same as it
 * would for a human's own real customization. A dedicated re-provision
 * action (or a tiles-empty-means-retry check) is a reasonable follow-up if
 * this proves to matter in practice.
 */
export async function installPluginAndProvisionBuiltins(params: InstallPluginParams): Promise<PluginInstallModel> {
  const install = await installPlugin(params);

  if (install.plugin_id === SAAS_METRIC_PACK_PLUGIN_ID) {
    await ensureSaasMetricPackRegistered(params.organizationId, params.projectId, params.installedByUserId);
    await ensureSaasMetricPackDefaultBoardsSeeded(params.organizationId, params.projectId, params.installedByUserId);
  }

  return install;
}
