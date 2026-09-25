import { FUNNEL_STAGE_KEYS, isFunnelStageKey, proposeFunnelSteps, type FunnelStageKey, type FunnelStepSuggestion } from '@growthos/shared';
import type { AuditActorType } from '../models/audit-log-entry.model';
import { ProjectModel } from '../models/project.model';
import {
  OnboardingStateModel,
  type OnboardingFunnelStep,
  type OnboardingPackKey,
  type OnboardingSourceConnectionMethod,
  type OnboardingStep,
} from '../models/onboarding-state.model';
import { SAAS_METRIC_PACK_PLUGIN_ID } from '../plugin-runtime/saas-metric-pack';
import { ENGAGEMENT_PACK_PLUGIN_ID } from '../plugin-runtime/engagement-pack';
import { LANDING_PAGE_PACK_PLUGIN_ID } from '../plugin-runtime/landing-page-pack';
import { ProjectNotFoundError } from './resource-library.service';
import { activeSchemaNamesForKind, listSchemaDefinitionsForProject } from './schema-registry.service';
import { recordAuditLogEntry } from './audit-log.service';
import { installBuiltinMetricPack } from './metric-pack-dispatch.service';
import { PluginAlreadyInstalledError } from './plugin-registry.service';
import { recordActivationEvent } from './product-analytics.service';

/** One built-in metric pack the wizard's "pick a vertical" step can install (plan `10 §2.6` step 1). `custom` (skip installing any pack) has no entry here — it's handled as a special case in {@link selectOnboardingMetricPack}. Pairs a wizard-facing `packKey` with the plugin id `installBuiltinMetricPack` (the same one-click, no-YAML path a project's Plugins page now also uses — see `metric-pack-dispatch.service.ts`) actually installs. */
interface OnboardingPackDefinition {
  packKey: Exclude<OnboardingPackKey, 'custom'>;
  pluginId: string;
}

const ONBOARDING_METRIC_PACKS: readonly OnboardingPackDefinition[] = [
  { packKey: 'saas_marketing', pluginId: SAAS_METRIC_PACK_PLUGIN_ID },
  { packKey: 'engagement', pluginId: ENGAGEMENT_PACK_PLUGIN_ID },
  { packKey: 'landing_page', pluginId: LANDING_PAGE_PACK_PLUGIN_ID },
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

/** Writes a fresh, untouched ("pack" step, nothing selected, no funnel) singleton state doc — the shared half of {@link getOrCreateOnboardingState} and {@link setProjectFunnel}, without the "wizard started" audit/activation side effects only the former should emit. */
async function createOnboardingStateDoc(organizationId: string, projectId: string, startedBy: string): Promise<OnboardingStateModel> {
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
  state.started_by = startedBy;
  state.started_at = now;
  state.completed_at = null;
  state.updated_at = now;
  state.setPathParams({ organization_id: organizationId, project_id: projectId });
  await state.save();
  return state;
}

/** Starts (or resumes) a project's onboarding wizard — creates the singleton state doc on first visit, audit-logged once since it marks "time to value" measurement starting (KAN-68 AC). Idempotent: a second call against an already-started project just returns the existing state untouched. */
export async function getOrCreateOnboardingState(organizationId: string, projectId: string, userId: string): Promise<OnboardingStateModel> {
  const existing = await getOnboardingState(organizationId, projectId);
  if (existing) {
    return existing;
  }

  const state = await createOnboardingStateDoc(organizationId, projectId, userId);

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
 * installs it one-click via `installBuiltinMetricPack` (registers the manifest into the org's Plugin
 * Registry, KAN-46, if it isn't already, then installs + provisions it — KAN-59/61/63's own "install
 * registers metrics, seeds default boards" flow) — the exact same path a project's Plugins page now
 * also offers outside the wizard, just driven by wizard state instead. `custom` records the selection
 * and moves on without installing anything (plan's own "or custom/hybrid").
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

    try {
      await installBuiltinMetricPack({
        organizationId: params.organizationId,
        projectId: params.projectId,
        pluginId: definition.pluginId,
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
  /** `false` when the funnel is being edited from outside the wizard's own funnel step (KAN-199: the confirmed-funnel summary's "Edit funnel"), so re-editing it never skips the wizard past steps the human has not done. Defaults to `true`, the wizard's own confirm. */
  advanceWizard?: boolean;
}

/** Persists the human-confirmed funnel step order (KAN-68 AC: "user confirms") — the proposal from {@link proposeOnboardingFunnelSteps} edited/reordered/pruned by the human, verbatim. */
export async function confirmOnboardingFunnelSteps(params: ConfirmOnboardingFunnelStepsParams): Promise<OnboardingStateModel> {
  const state = await getOrCreateOnboardingState(params.organizationId, params.projectId, params.userId);
  state.funnel_steps = params.steps.map((step, index) => ({ ...step, order: index }));
  if (params.advanceWizard !== false) {
    advanceStep(state, 'board');
  }
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

/**
 * The project's confirmed funnel, in step order — `[]` when none has been confirmed (no onboarding
 * state at all, or one whose funnel step was never confirmed/was confirmed empty). The one read path
 * every consumer of the confirmed funnel shares: `query_funnel`, the Funnel page and `set_funnel`.
 */
export async function getConfirmedFunnelSteps(organizationId: string, projectId: string): Promise<OnboardingFunnelStep[]> {
  const state = await getOnboardingState(organizationId, projectId);
  return [...(state?.funnel_steps ?? [])].sort((a, b) => a.order - b.order);
}

/** The fewest steps {@link setProjectFunnel} accepts: a single step has no conversion to measure. */
export const MIN_FUNNEL_STEPS = 2;

/** One requested funnel step. `stageKey` is optional — when omitted it is inferred from the event name by the same keyword heuristic the wizard's proposal uses (`proposeFunnelSteps`). */
export interface FunnelStepInput {
  eventSchemaName: string;
  stageKey?: string;
}

/** Every reason a requested funnel was refused, collected in one pass (not just the first) so a caller can fix the whole list at once — plus the event schemas that WOULD be accepted, since "unknown schema" alone leaves the caller guessing. */
export class InvalidFunnelDefinitionError extends Error {
  constructor(
    public readonly reasons: string[],
    public readonly availableEventSchemas: string[],
  ) {
    super(`Invalid funnel: ${reasons.join('; ')}`);
    this.name = 'InvalidFunnelDefinitionError';
  }
}

export interface PreviewProjectFunnelParams {
  organizationId: string;
  projectId: string;
  steps: readonly FunnelStepInput[];
}

export interface ProjectFunnelPreview {
  /** The funnel exactly as it would be stored — ordered, with every stage key resolved. */
  steps: OnboardingFunnelStep[];
  /** The currently confirmed funnel it would replace (`[]` if none). */
  previousSteps: OnboardingFunnelStep[];
  /** `false` when `steps` is identical to `previousSteps`, i.e. committing would be a no-op. */
  changed: boolean;
}

function sameFunnel(a: readonly OnboardingFunnelStep[], b: readonly OnboardingFunnelStep[]): boolean {
  return a.length === b.length && a.every((step, index) => step.eventSchemaName === b[index].eventSchemaName && step.stageKey === b[index].stageKey);
}

/**
 * Validates a requested funnel against the project's own schema registry and resolves it into the
 * exact `OnboardingFunnelStep[]` that {@link setProjectFunnel} would store, writing nothing. Rules:
 * at least {@link MIN_FUNNEL_STEPS} steps; every step names a registered, ACTIVE event schema of this
 * project (a funnel step is counted by `events.event_type`, so an entity/measure schema, or a name
 * nothing was ever registered under, could only ever count zero); no event twice (its count would
 * be the same number at two points of the funnel, which reads as a step nobody drops off at); and
 * an explicit stage key must be one of `FUNNEL_STAGE_KEYS`.
 */
export async function previewProjectFunnel(params: PreviewProjectFunnelParams): Promise<ProjectFunnelPreview> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const schemaDefs = await listSchemaDefinitionsForProject(params.organizationId, params.projectId);
  const eventSchemaNames = activeSchemaNamesForKind(schemaDefs, 'event');
  const activeEvents = new Set(eventSchemaNames);
  const otherKindByName = new Map(schemaDefs.filter((def) => def.status === 'active' && def.kind !== 'event').map((def) => [def.name, def.kind]));

  const reasons: string[] = [];
  if (params.steps.length < MIN_FUNNEL_STEPS) {
    reasons.push(`A funnel needs at least ${MIN_FUNNEL_STEPS} steps; got ${params.steps.length}.`);
  }

  const firstPositionByName = new Map<string, number>();
  const resolved: OnboardingFunnelStep[] = [];
  params.steps.forEach((step, index) => {
    const position = index + 1;
    const name = step.eventSchemaName;
    if (name.trim().length === 0) {
      reasons.push(`Step ${position} has an empty event schema name.`);
      return;
    }
    const earlier = firstPositionByName.get(name);
    if (earlier !== undefined) {
      reasons.push(`"${name}" appears more than once (steps ${earlier} and ${position}); each event can be only one step.`);
    } else {
      firstPositionByName.set(name, position);
    }
    if (!activeEvents.has(name)) {
      const otherKind = otherKindByName.get(name);
      reasons.push(
        otherKind
          ? `"${name}" is registered as a ${otherKind} schema, not an event; a funnel step must be an event schema.`
          : `"${name}" is not a registered event schema in this project.`,
      );
    }

    let stageKey: FunnelStageKey;
    if (step.stageKey === undefined) {
      stageKey = proposeFunnelSteps([name])[0].stageKey;
    } else if (isFunnelStageKey(step.stageKey)) {
      stageKey = step.stageKey;
    } else {
      reasons.push(`Step ${position} ("${name}") has stage key "${step.stageKey}", which is not one of: ${FUNNEL_STAGE_KEYS.join(', ')}.`);
      return;
    }
    resolved.push({ eventSchemaName: name, stageKey, order: index });
  });

  if (reasons.length > 0) {
    throw new InvalidFunnelDefinitionError(reasons, eventSchemaNames);
  }

  const previousSteps = await getConfirmedFunnelSteps(params.organizationId, params.projectId);
  return { steps: resolved, previousSteps, changed: !sameFunnel(resolved, previousSteps) };
}

export interface SetProjectFunnelParams extends PreviewProjectFunnelParams {
  actorType: AuditActorType;
  actorId: string;
}

/**
 * Replaces the project's confirmed funnel with a validated one (see {@link previewProjectFunnel} for
 * the rules) — the programmatic counterpart of the wizard's own "confirm funnel" step, writing the
 * SAME field (`OnboardingStateModel.funnel_steps`) that {@link confirmOnboardingFunnelSteps} writes
 * and `query_funnel`/the Funnel page read, so there is exactly one confirmed funnel per project
 * whichever surface set it.
 *
 * Two deliberate differences from the wizard's confirm: it does NOT advance the wizard's `step` (a
 * funnel defined over MCP says nothing about whether a human picked a pack or connected a source, and
 * jumping a fresh wizard straight to its final screen would hide those steps), and a project with no
 * wizard state yet gets one created silently — without the "onboarding started" audit entry and
 * activation event, since no human started anything. Audit-logged as `funnel.set` with the previous
 * and new step lists.
 */
export async function setProjectFunnel(params: SetProjectFunnelParams): Promise<ProjectFunnelPreview> {
  const preview = await previewProjectFunnel(params);

  const state =
    (await getOnboardingState(params.organizationId, params.projectId)) ??
    (await createOnboardingStateDoc(params.organizationId, params.projectId, params.actorId));
  state.funnel_steps = preview.steps;
  state.updated_at = new Date().toISOString();
  await state.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: params.actorType,
      actorId: params.actorId,
      action: 'funnel.set',
      targetType: 'onboarding_state',
      targetId: state.id,
      summary: `Set the project funnel: ${preview.steps.map((step) => step.eventSchemaName).join(' -> ')}`,
      before: { steps: preview.previousSteps },
      after: { steps: preview.steps },
    });
  } catch {
    // Best-effort — same posture as every other audit write in this file.
  }

  return preview;
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
