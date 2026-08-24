import type { PluginInstallModel } from '../models/plugin-install.model';
import {
  ensureSaasMetricPackDefaultBoardsSeeded,
  ensureSaasMetricPackRegistered,
  ensureSaasMetricPackSchemasRegistered,
  SAAS_METRIC_PACK_MANIFEST_YAML,
  SAAS_METRIC_PACK_PLUGIN_ID,
} from '../plugin-runtime/saas-metric-pack';
import {
  ensureEngagementPackRegistered,
  ENGAGEMENT_PACK_MANIFEST_YAML,
  ENGAGEMENT_PACK_PLUGIN_ID,
} from '../plugin-runtime/engagement-pack';
import {
  ensureLandingPagePackDefaultBoardsSeeded,
  ensureLandingPagePackRegistered,
  LANDING_PAGE_PACK_MANIFEST_YAML,
  LANDING_PAGE_PACK_PLUGIN_ID,
} from '../plugin-runtime/landing-page-pack';
import {
  ensureFeedbackPackRegistered,
  FEEDBACK_PACK_MANIFEST_YAML,
  FEEDBACK_PACK_PLUGIN_ID,
} from '../plugin-runtime/feedback-pack';
import {
  ensureChurnReasonPackRegistered,
  CHURN_REASON_PACK_MANIFEST_YAML,
  CHURN_REASON_PACK_PLUGIN_ID,
} from '../plugin-runtime/churn-reason-pack';
import {
  ensureQualityScorePackRegistered,
  QUALITY_SCORE_PACK_MANIFEST_YAML,
  QUALITY_SCORE_PACK_PLUGIN_ID,
} from '../plugin-runtime/quality-score-pack';
import {
  ensureCampaignOpsPackRegistered,
  CAMPAIGN_OPS_PACK_MANIFEST_YAML,
  CAMPAIGN_OPS_PACK_PLUGIN_ID,
} from '../plugin-runtime/campaign-ops-pack';
import {
  ensureFirmographicPackRegistered,
  FIRMOGRAPHIC_PACK_MANIFEST_YAML,
  FIRMOGRAPHIC_PACK_PLUGIN_ID,
} from '../plugin-runtime/firmographic-pack';
import {
  ensureExperimentPackRegistered,
  EXPERIMENT_PACK_MANIFEST_YAML,
  EXPERIMENT_PACK_PLUGIN_ID,
} from '../plugin-runtime/experiment-pack';
import { getLatestPluginManifestVersion, installPlugin, registerPluginManifest, type InstallPluginParams } from './plugin-registry.service';

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
 * metric). `ensureSaasMetricPackSchemasRegistered` runs first of all three:
 * it self-provisions the `ad_spend` measure schema that metric's own
 * aggregation `table` names, mirroring `ensureStripeCommerceSchemasRegistered`'s
 * schema-before-metrics ordering for the same reason (`metrics.ts`'s own doc
 * comment on `AD_SPEND`).
 *
 * Not transactional, the same documented, deliberately-deferred tradeoff
 * `registerMetricDefinition`/`registerSchemaDefinition` already accept: the
 * install is saved *before* `ensureSaasMetricPackSchemasRegistered`/
 * `ensureSaasMetricPackRegistered`/`ensureSaasMetricPackDefaultBoardsSeeded`
 * run, so a failure partway through (a transient Firestore error, not the
 * expected `DuplicateMetricDefinitionError`/`DuplicateSchemaDefinitionError`
 * path, which is swallowed) leaves an `installed` `PluginInstallModel` with
 * only some of its schema/metrics/boards provisioned, and a re-POST to
 * install the same plugin id in the same project throws
 * `PluginAlreadyInstalledError` rather than resuming — there is no retry
 * surface yet. `ensureSaasMetricPackSchemasRegistered`/
 * `ensureSaasMetricPackRegistered` are both fully retry-safe (each
 * schema/metric is one atomic write, so a human can uninstall and reinstall
 * to converge on all of them registered). Board seeding is now equally
 * retry-safe: `ensurePackDefaultBoardsSeeded` (shared by every pack with
 * default boards) tags each board it creates with the seeding pack's plugin
 * id, so a later call can tell "my own board, still empty because
 * `saveBoardTiles` never landed" apart from "a human's board that happens to
 * share this exact name" and repair only the former — see that function's
 * own doc comment.
 *
 * The built-in Engagement pack (KAN-63) follows the same "registers metrics,
 * nothing to sync" shape as the SaaS pack, minus default boards (not part
 * of that story's own AC) — its five metrics register via
 * `ensureEngagementPackRegistered`, equally retry-safe for the same reason.
 */
export async function installPluginAndProvisionBuiltins(params: InstallPluginParams): Promise<PluginInstallModel> {
  const install = await installPlugin(params);

  if (install.plugin_id === SAAS_METRIC_PACK_PLUGIN_ID) {
    // Schemas first: `ensureSaasMetricPackRegistered`'s own `ad_spend` metric names this schema
    // as its aggregation `table`, and `validateAggregationAgainstRegisteredSchema`
    // (`metric-registry.service.ts`) can only check its `column`/`timeColumn` against a schema
    // that already exists — same ordering `ensureStripeCommerceSchemasRegistered` establishes
    // relative to that connector's own metric registration.
    await ensureSaasMetricPackSchemasRegistered(params.organizationId, params.projectId, params.installedByUserId);
    await ensureSaasMetricPackRegistered(params.organizationId, params.projectId, params.installedByUserId);
    await ensureSaasMetricPackDefaultBoardsSeeded(params.organizationId, params.projectId, params.installedByUserId);
  } else if (install.plugin_id === ENGAGEMENT_PACK_PLUGIN_ID) {
    await ensureEngagementPackRegistered(params.organizationId, params.projectId, params.installedByUserId);
  } else if (install.plugin_id === LANDING_PAGE_PACK_PLUGIN_ID) {
    await ensureLandingPagePackRegistered(params.organizationId, params.projectId, params.installedByUserId);
    await ensureLandingPagePackDefaultBoardsSeeded(params.organizationId, params.projectId, params.installedByUserId);
  } else if (install.plugin_id === FEEDBACK_PACK_PLUGIN_ID) {
    await ensureFeedbackPackRegistered(params.organizationId, params.projectId, params.installedByUserId);
  } else if (install.plugin_id === CHURN_REASON_PACK_PLUGIN_ID) {
    await ensureChurnReasonPackRegistered(params.organizationId, params.projectId, params.installedByUserId);
  } else if (install.plugin_id === QUALITY_SCORE_PACK_PLUGIN_ID) {
    await ensureQualityScorePackRegistered(params.organizationId, params.projectId, params.installedByUserId);
  } else if (install.plugin_id === CAMPAIGN_OPS_PACK_PLUGIN_ID) {
    await ensureCampaignOpsPackRegistered(params.organizationId, params.projectId, params.installedByUserId);
  } else if (install.plugin_id === FIRMOGRAPHIC_PACK_PLUGIN_ID) {
    await ensureFirmographicPackRegistered(params.organizationId, params.projectId, params.installedByUserId);
  } else if (install.plugin_id === EXPERIMENT_PACK_PLUGIN_ID) {
    await ensureExperimentPackRegistered(params.organizationId, params.projectId, params.installedByUserId);
  }

  return install;
}

export class UnknownBuiltinMetricPackError extends Error {
  constructor(pluginId: string) {
    super(`"${pluginId}" is not one of this platform's built-in metric packs.`);
    this.name = 'UnknownBuiltinMetricPackError';
  }
}

interface BuiltinMetricPackCatalogEntry {
  pluginId: string;
  manifestYaml: string;
}

/**
 * Every metric pack this codebase ships, keyed by the plugin id its own
 * manifest declares. The one place that pairs a built-in pack's id with its
 * manifest text — `selectOnboardingMetricPack` (the wizard's "pick a pack"
 * step) keeps its own smaller list because it's also keyed by
 * `OnboardingPackKey`, a fixed 3-value union the wizard's UI renders fixed
 * cards for; this one is keyed by plugin id alone; so it can grow with the
 * plugin-runtime directory without the wizard needing a code change too.
 */
const BUILTIN_METRIC_PACKS: readonly BuiltinMetricPackCatalogEntry[] = [
  { pluginId: SAAS_METRIC_PACK_PLUGIN_ID, manifestYaml: SAAS_METRIC_PACK_MANIFEST_YAML },
  { pluginId: ENGAGEMENT_PACK_PLUGIN_ID, manifestYaml: ENGAGEMENT_PACK_MANIFEST_YAML },
  { pluginId: LANDING_PAGE_PACK_PLUGIN_ID, manifestYaml: LANDING_PAGE_PACK_MANIFEST_YAML },
  { pluginId: FEEDBACK_PACK_PLUGIN_ID, manifestYaml: FEEDBACK_PACK_MANIFEST_YAML },
  { pluginId: CHURN_REASON_PACK_PLUGIN_ID, manifestYaml: CHURN_REASON_PACK_MANIFEST_YAML },
  { pluginId: QUALITY_SCORE_PACK_PLUGIN_ID, manifestYaml: QUALITY_SCORE_PACK_MANIFEST_YAML },
  { pluginId: CAMPAIGN_OPS_PACK_PLUGIN_ID, manifestYaml: CAMPAIGN_OPS_PACK_MANIFEST_YAML },
  { pluginId: FIRMOGRAPHIC_PACK_PLUGIN_ID, manifestYaml: FIRMOGRAPHIC_PACK_MANIFEST_YAML },
  { pluginId: EXPERIMENT_PACK_PLUGIN_ID, manifestYaml: EXPERIMENT_PACK_MANIFEST_YAML },
];

/**
 * The built-in pack catalog for a project's Plugins page to render install
 * cards from — pluginId only, no manifest text and no display copy: per
 * CLAUDE.md, no hard-coded UI strings live in this package, so `apps/web`
 * keys its own translated title/description off `pluginId` the same way
 * `onboarding-pack-step.tsx` already keys off `packKey`.
 */
export function listBuiltinMetricPacks(): ReadonlyArray<{ pluginId: string }> {
  return BUILTIN_METRIC_PACKS.map(({ pluginId }) => ({ pluginId }));
}

export interface InstallBuiltinMetricPackParams {
  organizationId: string;
  projectId: string;
  pluginId: string;
  installedByUserId: string;
}

/**
 * The one-click path a project's Plugins page (and the onboarding wizard,
 * via `selectOnboardingMetricPack`) uses to install a built-in pack: a human
 * never sees or pastes its `plugin.yaml` text. Registers the manifest into
 * the org's Plugin Registry first if no version of it is registered yet —
 * the exact same "register once, every project in the org can then install
 * it" model a hand-pasted manifest already has (KAN-46) — then installs +
 * provisions it via {@link installPluginAndProvisionBuiltins}.
 *
 * Every built-in pack ships with an empty `config_schema` (none of them is a
 * source connector needing credentials), so `config: {}` here is always
 * correct — the same value `selectOnboardingMetricPack` has always passed.
 */
export async function installBuiltinMetricPack(params: InstallBuiltinMetricPackParams): Promise<PluginInstallModel> {
  const definition = BUILTIN_METRIC_PACKS.find((candidate) => candidate.pluginId === params.pluginId);
  if (!definition) {
    throw new UnknownBuiltinMetricPackError(params.pluginId);
  }

  let registered = await getLatestPluginManifestVersion(params.organizationId, definition.pluginId);
  if (!registered) {
    registered = await registerPluginManifest({
      organizationId: params.organizationId,
      manifestYaml: definition.manifestYaml,
      registeredByUserId: params.installedByUserId,
    });
  }

  return installPluginAndProvisionBuiltins({
    organizationId: params.organizationId,
    projectId: params.projectId,
    pluginId: definition.pluginId,
    version: registered.version,
    consentedScopes: registered.scopes,
    config: {},
    installedByUserId: params.installedByUserId,
  });
}
