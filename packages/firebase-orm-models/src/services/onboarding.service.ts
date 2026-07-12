import { proposeFunnelSteps, type FunnelStepSuggestion } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import {
  OnboardingStateModel,
  type OnboardingFunnelStep,
  type OnboardingPackKey,
  type OnboardingSourceConnectionMethod,
  type OnboardingStep,
} from '../models/onboarding-state.model';
import { SAAS_METRIC_PACK_PLUGIN_ID, SAAS_METRIC_PACK_MANIFEST_YAML } from '../plugin-runtime/saas-metric-pack';
import { ENGAGEMENT_PACK_PLUGIN_ID, ENGAGEMENT_PACK_MANIFEST_YAML } from '../plugin-runtime/engagement-pack';
import { ProjectNotFoundError } from './resource-library.service';
import { activeSchemaNamesForKind, listSchemaDefinitionsForProject } from './schema-registry.service';
import { recordAuditLogEntry } from './audit-log.service';
import { installPluginAndProvisionBuiltins } from './metric-pack-dispatch.service';
import { getLatestPluginManifestVersion, registerPluginManifest, PluginAlreadyInstalledError } from './plugin-registry.service';
import { recordActivationEvent } from './product-analytics.service';

/** One built-in metric pack the wizard's "pick a vertical" step can install (plan `10 §2.6` step 1). `custom` (skip installing any pack) has no entry here — it's handled as a special case in {@link selectOnboardingMetricPack}. */
interface OnboardingPackDefinition {
  packKey: Exclude<OnboardingPackKey, 'custom'>;
  pluginId: string;
  manifestYaml: string;
}

const ONBOARDING_METRIC_PACKS: readonly OnboardingPackDefinition[] = [
  { packKey: 'saas_marketing', pluginId: SAAS_METRIC_PACK_PLUGIN_ID, manifestYaml: SAAS_METRIC_PACK_MANIFEST_YAML },
  { packKey: 'engagement', pluginId: ENGAGEMENT_PACK_PLUGIN_ID, manifestYaml: ENGAGEMENT_PACK_MANIFEST_YAML },
];

/** The wizard's own read-only pack catalog — `apps/web` renders one card per entry, keyed by `packKey` for its own translation strings (no hard-coded display text lives in this package, per CLAUDE.md). */
export function listOnboardingMetricPacks(): ReadonlyArray<{ packKey: Exclude<OnboardingPackKey, 'custom'>; pluginId: string }> {
  return ONBOARDING_METRIC_PACKS.map(({ packKey, pluginId }) => ({ packKey, pluginId }));
}

export class InvalidOnboardingSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOnboardingSelectionError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/**
 * The project's onboarding-wizard singleton, or `null` if the wizard has never been opened for it.
 * Queried by `project_id` rather than a well-known fixed doc id — see `OnboardingStateModel`'s own doc
 * comment for why, and for the same non-transactional-race caveat `createBoard`/`createOrganization
 * WithOwner` already document elsewhere in this package: two concurrent first-visits could both pass
 * this "does one exist yet" check before either writes, leaving two singleton docs. `getOrCreate
 * OnboardingState` always takes the first one a query returns, so a duplicate would just become
 * invisible dead data rather than a correctness bug for any single caller.
 */
export async function getOnboardingState(organizationId: string, projectId: string): Promise<OnboardingStateModel | null> {
  await requireProjectInOrg(organizationId, projectId);
  const matches = await OnboardingStateModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .limit(1)
    .get();
  return matches[0] ?? null;
}

/** Starts (or resumes) a project's onboarding wizard — creates the singleton state doc on first visit, audit-logged once since it marks "time to value" measurement starting (KAN-68 AC). Idempotent: a second call against an already-started project just returns the existing state untouched. */
export async function getOrCreateOnboardingState(organizationId: string, projectId: string, userId: string): Promise<OnboardingStateModel> {
  const existing = await getOnboardingState(organizationId, projectId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const state = new OnboardingStateModel();
  state.organization_id = organizationId;
  state.project_id = projectId;
  state.step = 'pack';
  state.selected_pack_key = null;
  state.selected_plugin_id = null;
  state.source_connection_method = null;
  state.connected_source_plugin_id = null;
  state.funnel_steps = [];
  state.started_by = userId;
  state.started_at = now;
  state.completed_at = null;
  state.updated_at = now;
  state.setPathParams({ organization_id: organizationId, project_id: projectId });
  await state.save();

  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId: userId,
      action: 'onboarding.start',
      targetType: 'onboarding_state',
      targetId: state.id,
      summary: 'Started the onboarding wizard',
    });
  } catch {
    // Best-effort — audit logging must never turn a successful start into a failure for the caller.
  }

  await recordActivationEvent({
    funnelStep: 'onboarding_started',
    targetOrganizationId: organizationId,
    targetProjectId: projectId,
  });

  return state;
}

function advanceStep(state: OnboardingStateModel, next: OnboardingStep): void {
  // "Furthest step reached" semantics (see `OnboardingStateModel.step`'s own doc comment) — never
  // regress `step` if a later step is somehow confirmed again (e.g. the wizard is reopened and a
  // step re-submitted), since `ONBOARDING_STEPS` is declared in wizard order.
  const stepOrder = new Map(
    (['pack', 'sources', 'funnel', 'board', 'done'] satisfies readonly OnboardingStep[]).map((step, index) => [step, index]),
  );
  const currentIndex = stepOrder.get(state.step) ?? 0;
  const nextIndex = stepOrder.get(next) ?? 0;
  state.step = nextIndex > currentIndex ? next : state.step;
}

export interface SelectOnboardingMetricPackParams {
  organizationId: string;
  projectId: string;
  userId: string;
  packKey: OnboardingPackKey;
}

/**
 * The wizard's "pick a vertical/metric pack" step (plan `10 §2.6` step 1). For a real built-in pack,
 * registers its manifest into the org's Plugin Registry (KAN-46) if it isn't already, then installs +
 * provisions it into this project via `installPluginAndProvisionBuiltins` (KAN-59/61/63's own "install
 * registers metrics, seeds default boards" flow) — the exact same path an admin would go through by
 * hand on the org/project plugin pages, just driven by the wizard instead. `custom` records the
 * selection and moves on without installing anything (plan's own "or custom/hybrid").
 *
 * Idempotent against a plugin the wizard (or a human) already installed: `PluginAlreadyInstalledError`
 * is swallowed, since the metrics/boards it would have provisioned already exist from that earlier
 * install — see `installPluginAndProvisionBuiltins`'s own doc comment for the (documented, pre-existing)
 * partial-failure gap this inherits rather than introduces.
 */
export async function selectOnboardingMetricPack(params: SelectOnboardingMetricPackParams): Promise<OnboardingStateModel> {
  const state = await getOrCreateOnboardingState(params.organizationId, params.projectId, params.userId);

  if (params.packKey === 'custom') {
    state.selected_pack_key = 'custom';
    state.selected_plugin_id = null;
  } else {
    const definition = ONBOARDING_METRIC_PACKS.find((candidate) => candidate.packKey === params.packKey);
    if (!definition) {
      throw new InvalidOnboardingSelectionError(`Unknown onboarding pack key "${params.packKey}".`);
    }

    let registered = await getLatestPluginManifestVersion(params.organizationId, definition.pluginId);
    if (!registered) {
      registered = await registerPluginManifest({
        organizationId: params.organizationId,
        manifestYaml: definition.manifestYaml,
        registeredByUserId: params.userId,
      });
    }

    try {
      await installPluginAndProvisionBuiltins({
        organizationId: params.organizationId,
        projectId: params.projectId,
        pluginId: definition.pluginId,
        version: registered.version,
        consentedScopes: registered.scopes,
        config: {},
        installedByUserId: params.userId,
      });
    } catch (error) {
      if (!(error instanceof PluginAlreadyInstalledError)) {
        throw error;
      }
    }

    state.selected_pack_key = params.packKey;
    state.selected_plugin_id = definition.pluginId;
  }

  advanceStep(state, 'sources');
  state.updated_at = new Date().toISOString();
  await state.save();

  await recordActivationEvent({
    funnelStep: 'pack_selected',
    targetOrganizationId: params.organizationId,
    targetProjectId: params.projectId,
    packKey: params.packKey,
  });

  return state;
}

export interface MarkOnboardingSourceConnectedParams {
  organizationId: string;
  projectId: string;
  userId: string;
  method: OnboardingSourceConnectionMethod;
  /** The installed source plugin's id — required (and only meaningful) when `method` is `'plugin'`. */
  pluginId?: string;
}

/** The wizard's "connect a first source" step (plan `10 §2.6` step 2). Records *how* the human connected a source — the actual connection (a plugin install via the KAN-46/47 flow, or an `ingest.write` key mint via KAN-28/30) happens through those existing surfaces, reused as-is rather than duplicated here. */
export async function markOnboardingSourceConnected(params: MarkOnboardingSourceConnectedParams): Promise<OnboardingStateModel> {
  const state = await getOrCreateOnboardingState(params.organizationId, params.projectId, params.userId);
  state.source_connection_method = params.method;
  state.connected_source_plugin_id = params.method === 'plugin' ? (params.pluginId ?? null) : null;
  advanceStep(state, 'funnel');
  state.updated_at = new Date().toISOString();
  await state.save();

  await recordActivationEvent({
    funnelStep: 'source_connected',
    targetOrganizationId: params.organizationId,
    targetProjectId: params.projectId,
    sourceConnectionMethod: params.method,
  });

  return state;
}

/** The wizard's "AI proposes a funnel mapping" step (KAN-68 AC) — proposes an ordered funnel from whatever event schemas are already registered+active in this project (from ingest so far, or from the just-installed pack's own schemas). A project with no event schemas yet returns an empty proposal; the wizard's own UI handles that as "nothing to confirm yet, continue anyway". */
export async function proposeOnboardingFunnelSteps(organizationId: string, projectId: string): Promise<FunnelStepSuggestion[]> {
  await requireProjectInOrg(organizationId, projectId);
  const schemaDefs = await listSchemaDefinitionsForProject(organizationId, projectId);
  const eventSchemaNames = activeSchemaNamesForKind(schemaDefs, 'event');
  return proposeFunnelSteps(eventSchemaNames);
}

export interface ConfirmOnboardingFunnelStepsParams {
  organizationId: string;
  projectId: string;
  userId: string;
  steps: readonly OnboardingFunnelStep[];
}

/** Persists the human-confirmed funnel step order (KAN-68 AC: "user confirms") — the proposal from {@link proposeOnboardingFunnelSteps} edited/reordered/pruned by the human, verbatim. */
export async function confirmOnboardingFunnelSteps(params: ConfirmOnboardingFunnelStepsParams): Promise<OnboardingStateModel> {
  const state = await getOrCreateOnboardingState(params.organizationId, params.projectId, params.userId);
  state.funnel_steps = params.steps.map((step, index) => ({ ...step, order: index }));
  advanceStep(state, 'board');
  state.updated_at = new Date().toISOString();
  await state.save();

  await recordActivationEvent({
    funnelStep: 'funnel_confirmed',
    targetOrganizationId: params.organizationId,
    targetProjectId: params.projectId,
    funnelStepCount: params.steps.length,
  });

  return state;
}

export interface CompleteOnboardingParams {
  organizationId: string;
  projectId: string;
  userId: string;
}

/** The wizard's final "invite team + set a goal + turn on the war room" step (plan `10 §2.6` step 5) — every one of those actions happens through its own existing surface (KAN-25 invites, KAN-64 goals, KAN-67 TV pairing); this just marks the wizard done and stamps `completed_at` for the AC's own time-to-value measurement. Audit-logged once, mirroring `getOrCreateOnboardingState`'s own start-event logging. */
export async function completeOnboarding(params: CompleteOnboardingParams): Promise<OnboardingStateModel> {
  const state = await getOrCreateOnboardingState(params.organizationId, params.projectId, params.userId);
  state.step = 'done';
  state.completed_at = new Date().toISOString();
  state.updated_at = state.completed_at;
  await state.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.userId,
      action: 'onboarding.complete',
      targetType: 'onboarding_state',
      targetId: state.id,
      summary: 'Completed the onboarding wizard',
    });
  } catch {
    // Best-effort — audit logging must never turn a successful completion into a failure for the caller.
  }

  await recordActivationEvent({
    funnelStep: 'onboarding_completed',
    targetOrganizationId: params.organizationId,
    targetProjectId: params.projectId,
  });

  return state;
}
