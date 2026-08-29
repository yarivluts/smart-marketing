import { evaluateBudgetChangeGuardrails, evaluateCampaignActivationGuardrails, evaluateCampaignCreationGuardrails, type GuardrailViolation } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import {
  AutomationTargetStateModel,
  CAMPAIGN_STATUSES,
  EXTERNAL_AD_PLATFORMS,
  type CampaignStatus,
  type ExternalAdPlatform,
} from '../models/automation-target-state.model';
import { AutomationActionModel, type AutomationActionStatus, type AutomationActionType } from '../models/automation-action.model';
import { ResourceAttachmentModel, type ConnectionWriteTier } from '../models/resource-attachment.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { getActiveAutomationGuardrailPolicy, toPureGuardrailPolicy } from './automation-guardrail.service';
import { isAutomationKillSwitchEngaged } from './automation-kill-switch.service';
import { runWithRetryBackoff } from '../plugin-runtime/retry';
import {
  defaultAutomationActionExecutor,
  validateAdEditActionInput,
  validateCampaignDraft,
  validateKeywordEditActionInput,
  validateMetaAdCreativeEditActionInput,
  validateMetaAdSetEditActionInput,
  validateMetaAdSetTargetingEditActionInput,
  InvalidCampaignDraftError,
  type AdEditResponsiveSearchAdContent,
  type AutomationActionExecutor,
  type CampaignDraft,
  type CampaignDraftKeyword,
  type MetaAdCreativeEditContent,
  type MetaAdSetStatus,
  type MetaAdSetTargetingEdit,
} from '../automation-runtime';
import {
  AutomationActionInvalidStateError,
  AutomationActionNotFoundError,
  AutomationKillSwitchEngagedError,
  AutomationTargetNotFoundError,
  InsufficientWriteTierError,
  InvalidAutomationActionError,
} from './automation-errors';

export {
  AutomationTargetNotFoundError,
  AutomationActionNotFoundError,
  AutomationActionInvalidStateError,
  AutomationKillSwitchEngagedError,
  InsufficientWriteTierError,
  InvalidAutomationActionError,
};

/** Bounds how many of today's executed actions this reads to enforce the blast-radius guardrail — same reasoning as `checkProjectQueryQuota`'s own bound. */
const DEFAULT_ACTION_LIST_LIMIT = 100;

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

async function loadAction(organizationId: string, projectId: string, actionId: string): Promise<AutomationActionModel> {
  const action = await AutomationActionModel.init(actionId, { organization_id: organizationId, project_id: projectId });
  if (!action || action.project_id !== projectId) {
    throw new AutomationActionNotFoundError();
  }
  return action;
}

async function loadTargetForAction(organizationId: string, projectId: string, targetId: string): Promise<AutomationTargetStateModel> {
  const target = await AutomationTargetStateModel.init(targetId, { organization_id: organizationId, project_id: projectId });
  if (!target || target.project_id !== projectId) {
    throw new AutomationTargetNotFoundError(targetId);
  }
  return target;
}

/** `campaign_draft_create`/`campaign_activation`/`keyword_edit`/`ad_edit`/`meta_ad_set_edit`/`meta_ad_set_targeting_edit`/`meta_ad_creative_edit` (KAN-72/KAN-73) touch a campaign's full lifecycle, so — unlike `budget_change`, which Optimize already permits — they require the linked connection to be approved at the `manage` tier specifically. */
const MANAGE_ONLY_ACTION_TYPES: ReadonlySet<AutomationActionType> = new Set([
  'campaign_draft_create',
  'campaign_activation',
  'keyword_edit',
  'ad_edit',
  'meta_ad_set_edit',
  'meta_ad_set_targeting_edit',
  'meta_ad_creative_edit',
]);

function minimumWriteTierForActionType(actionType: AutomationActionType): ConnectionWriteTier {
  return MANAGE_ONLY_ACTION_TYPES.has(actionType) ? 'manage' : 'optimize';
}

/** A short human phrase for an action's `action_type`, reused across every audit-log summary so none of them stay hardcoded to "the budget change" for the KAN-72 action types. */
function actionSummaryVerb(actionType: AutomationActionType): string {
  if (actionType === 'campaign_draft_create') {
    return 'the new campaign draft';
  }
  if (actionType === 'campaign_activation') {
    return 'the campaign activation';
  }
  if (actionType === 'keyword_edit') {
    return 'the keyword edit';
  }
  if (actionType === 'ad_edit') {
    return 'the ad edit';
  }
  if (actionType === 'meta_ad_set_edit') {
    return 'the ad set edit';
  }
  if (actionType === 'meta_ad_set_targeting_edit') {
    return 'the ad set targeting edit';
  }
  if (actionType === 'meta_ad_creative_edit') {
    return 'the ad creative edit';
  }
  return 'the budget change';
}

const WRITE_TIER_RANK: Record<ConnectionWriteTier, number> = { read: 0, optimize: 1, manage: 2 };

/** The `target_id` a given action was proposed against — lets a caller (KAN-72's `apps/web` execute/rollback routes) resolve the right `AutomationActionExecutor` for the action's target before invoking `executeAutomationAction`/`rollbackAutomationAction`, without duplicating `loadAction`'s own not-found/cross-project checks. */
export async function getAutomationActionTargetId(organizationId: string, projectId: string, actionId: string): Promise<string> {
  const action = await loadAction(organizationId, projectId, actionId);
  return action.target_id;
}

async function requireStatus(action: AutomationActionModel, expected: AutomationActionStatus, attemptedTransition: string): Promise<void> {
  if (action.status !== expected) {
    throw new AutomationActionInvalidStateError(action.status, attemptedTransition);
  }
}

interface AuditParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorType: 'user' | 'system';
  actorId: string;
  action: string;
  targetId: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

async function auditBestEffort(params: AuditParams): Promise<void> {
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: params.environmentId,
      actorType: params.actorType,
      actorId: params.actorId,
      action: params.action,
      targetType: 'automation_action',
      targetId: params.targetId,
      summary: params.summary,
      before: params.before,
      after: params.after,
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }
}

export interface SeedAutomationTargetParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  targetType: string;
  label: string;
  initialDailyBudgetUsd: number;
  seededByUserId: string;
  /**
   * Optionally links this target to one of the project's approved
   * `credential` connections (KAN-27/74) so its write actions are gated by
   * that connection's current `write_tier`. Omit for an ungated demo target
   * (the pre-KAN-74 default — no tier check ever applies to it).
   */
  resourceAttachmentId?: string;
}

/** Confirms `resourceAttachmentId` names an approved `credential` connection actually belonging to this project — never trust a caller-supplied id blindly, same posture `requireResourceInOrg` already established. */
async function requireCredentialConnectionForProject(
  organizationId: string,
  projectId: string,
  resourceAttachmentId: string,
): Promise<void> {
  const attachment = await ResourceAttachmentModel.init(resourceAttachmentId, { organization_id: organizationId });
  if (
    !attachment ||
    attachment.project_id !== projectId ||
    attachment.resource_kind !== 'credential' ||
    attachment.status !== 'approved'
  ) {
    throw new InvalidAutomationActionError('resourceAttachmentId must be an approved credential connection for this project');
  }
}

/**
 * Idempotent get-or-create for a simulated ad-platform target's starting
 * state (same "register-if-missing" posture as `ensureTouchpointSchemaRegistered`,
 * KAN-57) — a real Google/Meta connector (KAN-72/73) would instead read the
 * target's actual live state on first sight of it.
 */
export async function ensureAutomationTargetSeeded(params: SeedAutomationTargetParams): Promise<AutomationTargetStateModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  if (!Number.isFinite(params.initialDailyBudgetUsd) || params.initialDailyBudgetUsd < 0) {
    throw new InvalidAutomationActionError('initialDailyBudgetUsd must be a non-negative number');
  }
  if (params.resourceAttachmentId !== undefined) {
    await requireCredentialConnectionForProject(params.organizationId, params.projectId, params.resourceAttachmentId);
  }

  const existing = await AutomationTargetStateModel.init(params.targetId, { organization_id: params.organizationId, project_id: params.projectId });
  if (existing && existing.project_id === params.projectId) {
    return existing;
  }

  const target = new AutomationTargetStateModel();
  target.organization_id = params.organizationId;
  target.project_id = params.projectId;
  target.environment_id = params.environmentId;
  target.target_type = params.targetType;
  target.label = params.label;
  target.daily_budget_usd = params.initialDailyBudgetUsd;
  const now = new Date().toISOString();
  target.seeded_at = now;
  target.updated_at = now;
  target.seeded_by_user_id = params.seededByUserId;
  target.resource_attachment_id = params.resourceAttachmentId;
  target.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await target.save(params.targetId);

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: params.environmentId,
      actorType: 'user',
      actorId: params.seededByUserId,
      action: 'automation_target.seed',
      targetType: 'automation_target',
      targetId: target.id,
      summary: `Seeded automation target "${target.label}" (${target.target_type})`,
      after: { targetType: target.target_type, label: target.label, dailyBudgetUsd: target.daily_budget_usd },
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return target;
}

/** Every simulated target seeded for a project, across all its environments — same cross-environment "one admin view" posture as `listApiKeysForProject`. */
export async function listAutomationTargetStatesForProject(organizationId: string, projectId: string): Promise<AutomationTargetStateModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  return AutomationTargetStateModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
}

/**
 * How many automation actions this project has already *executed* today
 * (UTC calendar day) — the blast-radius guardrail's own counter. Only
 * queried when the policy actually sets `maxActionsPerDay` (an off guardrail
 * shouldn't cost a read), bounded to `limit + 1` documents the same way
 * `checkProjectQueryQuota` bounds its own quota read.
 */
async function countAutomationActionsExecutedToday(organizationId: string, projectId: string, now: Date, limit: number): Promise<number> {
  const startOfDayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const executedToday = await AutomationActionModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('executed_at', '>=', startOfDayIso)
    .limit(limit + 1)
    .get();
  return executedToday.length;
}

/**
 * Resolves whether `target`'s linked connection (if any) currently permits a
 * mutation requiring at least `minimumTier` — `null` means either there's no
 * linked connection (ungated) or the connection is approved at a tier that
 * meets or exceeds `minimumTier`. Re-resolved fresh on every call (never
 * cached on the target/action) so a tier downgrade takes effect immediately,
 * per KAN-74's own AC.
 */
async function resolveWriteTierViolation(
  organizationId: string,
  projectId: string,
  target: AutomationTargetStateModel,
  minimumTier: ConnectionWriteTier,
): Promise<GuardrailViolation | null> {
  if (!target.resource_attachment_id) {
    return null;
  }
  const attachment = await ResourceAttachmentModel.init(target.resource_attachment_id, { organization_id: organizationId });
  const insufficient =
    !attachment ||
    attachment.project_id !== projectId ||
    attachment.resource_kind !== 'credential' ||
    attachment.status !== 'approved' ||
    WRITE_TIER_RANK[attachment.write_tier] < WRITE_TIER_RANK[minimumTier];
  if (!insufficient) {
    return null;
  }
  return {
    type: 'insufficient_write_tier',
    message:
      minimumTier === 'manage'
        ? "This target's connection is not approved at the Manage write tier required to create or activate a campaign."
        : "This target's connection is not approved at a write tier (Optimize or Manage) that allows budget changes.",
  };
}

/** Same check as {@link resolveWriteTierViolation}, but for a step (approve/execute) that must hard-fail rather than land the action as `blocked` — the guardrail-violation list is only ever written at propose time. */
async function assertSufficientWriteTierForAction(organizationId: string, projectId: string, action: AutomationActionModel): Promise<void> {
  const target = await AutomationTargetStateModel.init(action.target_id, { organization_id: organizationId, project_id: projectId });
  if (!target || target.project_id !== projectId) {
    return;
  }
  const violation = await resolveWriteTierViolation(organizationId, projectId, target, minimumWriteTierForActionType(action.action_type));
  if (violation) {
    throw new InsufficientWriteTierError();
  }
}

export interface ProposeAutomationBudgetChangeParams {
  organizationId: string;
  projectId: string;
  targetId: string;
  afterDailyBudgetUsd: number;
  requestedByUserId: string;
  now?: Date;
}

/**
 * KAN-71's dry-run-diff step: resolves the target's current (simulated) state
 * as the "before" half of the diff, evaluates every guardrail type against
 * the proposed change (including the org kill switch), and lands the action
 * as `blocked` (any violation) or `awaiting_approval` (clean) — never
 * `proposed`, see `AutomationActionModel`'s own doc comment.
 */
export async function proposeAutomationBudgetChangeAction(params: ProposeAutomationBudgetChangeParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  if (!Number.isFinite(params.afterDailyBudgetUsd) || params.afterDailyBudgetUsd < 0) {
    throw new InvalidAutomationActionError('afterDailyBudgetUsd must be a non-negative number');
  }

  const target = await AutomationTargetStateModel.init(params.targetId, { organization_id: params.organizationId, project_id: params.projectId });
  if (!target || target.project_id !== params.projectId) {
    throw new AutomationTargetNotFoundError(params.targetId);
  }

  const now = params.now ?? new Date();
  const policy = await getActiveAutomationGuardrailPolicy(params.organizationId, params.projectId);
  const actionsExecutedToday =
    policy.maxActionsPerDay !== null
      ? await countAutomationActionsExecutedToday(params.organizationId, params.projectId, now, policy.maxActionsPerDay)
      : 0;

  const violations: GuardrailViolation[] = evaluateBudgetChangeGuardrails(
    toPureGuardrailPolicy(policy),
    { targetId: params.targetId, beforeDailyBudgetUsd: target.daily_budget_usd, afterDailyBudgetUsd: params.afterDailyBudgetUsd },
    { nowUtc: now, actionsExecutedToday },
  );

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    violations.push({ type: 'automation_paused', message: 'Automation is paused for this organization (kill switch engaged).' });
  }

  const tierViolation = await resolveWriteTierViolation(params.organizationId, params.projectId, target, 'optimize');
  if (tierViolation) {
    violations.push(tierViolation);
  }

  const before = { dailyBudgetUsd: target.daily_budget_usd };
  const after = { dailyBudgetUsd: params.afterDailyBudgetUsd };
  const status: AutomationActionStatus = violations.length > 0 ? 'blocked' : 'awaiting_approval';

  const action = new AutomationActionModel();
  action.organization_id = params.organizationId;
  action.project_id = params.projectId;
  action.environment_id = target.environment_id;
  action.action_type = 'budget_change';
  action.target_id = params.targetId;
  action.target_label = target.label;
  action.before = before;
  action.after = after;
  action.status = status;
  action.guardrail_violations = violations;
  action.requested_by_user_id = params.requestedByUserId;
  action.proposed_at = now.toISOString();
  action.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: target.environment_id,
    actorType: 'user',
    actorId: params.requestedByUserId,
    action: 'automation_action.propose',
    targetId: action.id,
    summary:
      status === 'blocked'
        ? `Proposed a budget change for "${target.label}" — blocked by ${violations.length} guardrail(s)`
        : `Proposed a budget change for "${target.label}"`,
    before,
    after,
  });

  return action;
}

export interface ProposeCampaignDraftCreateActionParams {
  organizationId: string;
  projectId: string;
  targetId: string;
  draft: CampaignDraft;
  requestedByUserId: string;
  now?: Date;
}

/**
 * KAN-72's dry-run-diff step for a brand-new campaign — plan `02 §3`'s "the
 * AI drafts a new search campaign from your winning themes; you approve; it
 * goes live". `target` must already be seeded (via `ensureAutomationTargetSeeded`,
 * same as `budget_change`) but must not have a campaign created against it
 * yet, so a target only ever gets one `campaign_draft_create` in its
 * lifetime.
 */
export async function proposeCampaignDraftCreateAction(params: ProposeCampaignDraftCreateActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  try {
    validateCampaignDraft(params.draft);
  } catch (error) {
    if (error instanceof InvalidCampaignDraftError) {
      throw new InvalidAutomationActionError(error.message);
    }
    throw error;
  }

  const target = await loadTargetForAction(params.organizationId, params.projectId, params.targetId);
  if (target.campaign_resource_name) {
    throw new InvalidAutomationActionError('this target already has a campaign created — propose a budget_change or campaign_activation action instead');
  }

  const now = params.now ?? new Date();
  const policy = await getActiveAutomationGuardrailPolicy(params.organizationId, params.projectId);
  const actionsExecutedToday =
    policy.maxActionsPerDay !== null
      ? await countAutomationActionsExecutedToday(params.organizationId, params.projectId, now, policy.maxActionsPerDay)
      : 0;

  const violations: GuardrailViolation[] = evaluateCampaignCreationGuardrails(
    toPureGuardrailPolicy(policy),
    { targetId: params.targetId, dailyBudgetUsd: params.draft.dailyBudgetUsd },
    { nowUtc: now, actionsExecutedToday },
  );

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    violations.push({ type: 'automation_paused', message: 'Automation is paused for this organization (kill switch engaged).' });
  }

  const tierViolation = await resolveWriteTierViolation(params.organizationId, params.projectId, target, 'manage');
  if (tierViolation) {
    violations.push(tierViolation);
  }

  const before = {};
  const after = { campaignDraft: params.draft };
  const status: AutomationActionStatus = violations.length > 0 ? 'blocked' : 'awaiting_approval';

  const action = new AutomationActionModel();
  action.organization_id = params.organizationId;
  action.project_id = params.projectId;
  action.environment_id = target.environment_id;
  action.action_type = 'campaign_draft_create';
  action.target_id = params.targetId;
  action.target_label = target.label;
  action.before = before;
  action.after = after;
  action.status = status;
  action.guardrail_violations = violations;
  action.requested_by_user_id = params.requestedByUserId;
  action.proposed_at = now.toISOString();
  action.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: target.environment_id,
    actorType: 'user',
    actorId: params.requestedByUserId,
    action: 'automation_action.propose',
    targetId: action.id,
    summary:
      status === 'blocked'
        ? `Proposed a new campaign draft "${params.draft.campaignName}" for "${target.label}" — blocked by ${violations.length} guardrail(s)`
        : `Proposed a new campaign draft "${params.draft.campaignName}" for "${target.label}"`,
    before,
    after,
  });

  return action;
}

export interface ProposeCampaignActivationActionParams {
  organizationId: string;
  projectId: string;
  targetId: string;
  requestedByUserId: string;
  now?: Date;
}

/** KAN-72's dry-run-diff step for activating an already-created, still-paused campaign (plan `02 §3`'s "... you approve; it goes live"). */
export async function proposeCampaignActivationAction(params: ProposeCampaignActivationActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const target = await loadTargetForAction(params.organizationId, params.projectId, params.targetId);
  if (!target.campaign_resource_name || target.campaign_status !== 'paused') {
    throw new InvalidAutomationActionError('this target has no paused campaign to activate');
  }

  const now = params.now ?? new Date();
  const policy = await getActiveAutomationGuardrailPolicy(params.organizationId, params.projectId);
  const actionsExecutedToday =
    policy.maxActionsPerDay !== null
      ? await countAutomationActionsExecutedToday(params.organizationId, params.projectId, now, policy.maxActionsPerDay)
      : 0;

  const violations: GuardrailViolation[] = evaluateCampaignActivationGuardrails(
    toPureGuardrailPolicy(policy),
    { targetId: params.targetId },
    { nowUtc: now, actionsExecutedToday },
  );

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    violations.push({ type: 'automation_paused', message: 'Automation is paused for this organization (kill switch engaged).' });
  }

  const tierViolation = await resolveWriteTierViolation(params.organizationId, params.projectId, target, 'manage');
  if (tierViolation) {
    violations.push(tierViolation);
  }

  const before = { status: 'paused' };
  const after = { status: 'enabled' };
  const status: AutomationActionStatus = violations.length > 0 ? 'blocked' : 'awaiting_approval';

  const action = new AutomationActionModel();
  action.organization_id = params.organizationId;
  action.project_id = params.projectId;
  action.environment_id = target.environment_id;
  action.action_type = 'campaign_activation';
  action.target_id = params.targetId;
  action.target_label = target.label;
  action.before = before;
  action.after = after;
  action.status = status;
  action.guardrail_violations = violations;
  action.requested_by_user_id = params.requestedByUserId;
  action.proposed_at = now.toISOString();
  action.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: target.environment_id,
    actorType: 'user',
    actorId: params.requestedByUserId,
    action: 'automation_action.propose',
    targetId: action.id,
    summary:
      status === 'blocked'
        ? `Proposed activating the campaign for "${target.label}" — blocked by ${violations.length} guardrail(s)`
        : `Proposed activating the campaign for "${target.label}"`,
    before,
    after,
  });

  return action;
}

export interface ProposeKeywordEditActionParams {
  organizationId: string;
  projectId: string;
  targetId: string;
  adGroupResourceName: string;
  addKeywords: CampaignDraftKeyword[];
  addNegativeKeywords: CampaignDraftKeyword[];
  requestedByUserId: string;
  now?: Date;
}

/**
 * KAN-72 follow-up's dry-run-diff step for adding keywords/negative keywords
 * to an already-created ad group ("post-creation keyword edits", plan
 * `13 §E21.2`'s own deferred bullet). `adGroupResourceName` must be one of
 * `target.ad_group_resource_names` — set by a `campaign_draft_create` action
 * this same target already executed — so a caller can never point a keyword
 * edit at an arbitrary ad group outside this target's own campaign. Reuses
 * `evaluateCampaignActivationGuardrails`'s shape (no budget number involved,
 * same as an activation) for the protected-target/allowed-hours/blast-radius
 * checks.
 */
export async function proposeKeywordEditAction(params: ProposeKeywordEditActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  try {
    validateKeywordEditActionInput({
      adGroupResourceName: params.adGroupResourceName,
      addKeywords: params.addKeywords,
      addNegativeKeywords: params.addNegativeKeywords,
    });
  } catch (error) {
    if (error instanceof InvalidCampaignDraftError) {
      throw new InvalidAutomationActionError(error.message);
    }
    throw error;
  }

  const target = await loadTargetForAction(params.organizationId, params.projectId, params.targetId);
  if (!target.ad_group_resource_names?.includes(params.adGroupResourceName)) {
    throw new InvalidAutomationActionError('adGroupResourceName must be one of this target\'s own ad groups (created by a campaign_draft_create action)');
  }

  const now = params.now ?? new Date();
  const policy = await getActiveAutomationGuardrailPolicy(params.organizationId, params.projectId);
  const actionsExecutedToday =
    policy.maxActionsPerDay !== null
      ? await countAutomationActionsExecutedToday(params.organizationId, params.projectId, now, policy.maxActionsPerDay)
      : 0;

  const violations: GuardrailViolation[] = evaluateCampaignActivationGuardrails(
    toPureGuardrailPolicy(policy),
    { targetId: params.targetId },
    { nowUtc: now, actionsExecutedToday },
  );

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    violations.push({ type: 'automation_paused', message: 'Automation is paused for this organization (kill switch engaged).' });
  }

  const tierViolation = await resolveWriteTierViolation(params.organizationId, params.projectId, target, 'manage');
  if (tierViolation) {
    violations.push(tierViolation);
  }

  const before = { adGroupResourceName: params.adGroupResourceName };
  const after = { adGroupResourceName: params.adGroupResourceName, addKeywords: params.addKeywords, addNegativeKeywords: params.addNegativeKeywords };
  const status: AutomationActionStatus = violations.length > 0 ? 'blocked' : 'awaiting_approval';

  const action = new AutomationActionModel();
  action.organization_id = params.organizationId;
  action.project_id = params.projectId;
  action.environment_id = target.environment_id;
  action.action_type = 'keyword_edit';
  action.target_id = params.targetId;
  action.target_label = target.label;
  action.before = before;
  action.after = after;
  action.status = status;
  action.guardrail_violations = violations;
  action.requested_by_user_id = params.requestedByUserId;
  action.proposed_at = now.toISOString();
  action.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: target.environment_id,
    actorType: 'user',
    actorId: params.requestedByUserId,
    action: 'automation_action.propose',
    targetId: action.id,
    summary:
      status === 'blocked'
        ? `Proposed a keyword edit for "${target.label}" — blocked by ${violations.length} guardrail(s)`
        : `Proposed a keyword edit for "${target.label}"`,
    before,
    after,
  });

  return action;
}

export interface ProposeAdEditActionParams {
  organizationId: string;
  projectId: string;
  targetId: string;
  previousAdResourceName: string;
  responsiveSearchAd: AdEditResponsiveSearchAdContent;
  requestedByUserId: string;
  now?: Date;
}

/**
 * KAN-72 follow-up's dry-run-diff step for replacing an already-created ad
 * group's Responsive Search Ad with revised headlines/descriptions/final URL
 * ("post-creation ad edits", plan `13 §E21.2`'s own deferred bullet).
 * `previousAdResourceName` must be one of `target.ad_resource_names` — set by
 * a `campaign_draft_create` action this same target already executed (and
 * updated by a prior `ad_edit`) — so a caller can never point an ad edit at
 * an arbitrary ad outside this target's own campaign. Reuses
 * `evaluateCampaignActivationGuardrails`'s shape (no budget number involved),
 * the same guardrail posture `proposeKeywordEditAction` already established
 * for its own sibling action type.
 */
export async function proposeAdEditAction(params: ProposeAdEditActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  try {
    validateAdEditActionInput({
      previousAdResourceName: params.previousAdResourceName,
      responsiveSearchAd: params.responsiveSearchAd,
    });
  } catch (error) {
    if (error instanceof InvalidCampaignDraftError) {
      throw new InvalidAutomationActionError(error.message);
    }
    throw error;
  }

  const target = await loadTargetForAction(params.organizationId, params.projectId, params.targetId);
  if (!target.ad_resource_names?.includes(params.previousAdResourceName)) {
    throw new InvalidAutomationActionError('previousAdResourceName must be one of this target\'s own ads (created by a campaign_draft_create action)');
  }

  const now = params.now ?? new Date();
  const policy = await getActiveAutomationGuardrailPolicy(params.organizationId, params.projectId);
  const actionsExecutedToday =
    policy.maxActionsPerDay !== null
      ? await countAutomationActionsExecutedToday(params.organizationId, params.projectId, now, policy.maxActionsPerDay)
      : 0;

  const violations: GuardrailViolation[] = evaluateCampaignActivationGuardrails(
    toPureGuardrailPolicy(policy),
    { targetId: params.targetId },
    { nowUtc: now, actionsExecutedToday },
  );

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    violations.push({ type: 'automation_paused', message: 'Automation is paused for this organization (kill switch engaged).' });
  }

  const tierViolation = await resolveWriteTierViolation(params.organizationId, params.projectId, target, 'manage');
  if (tierViolation) {
    violations.push(tierViolation);
  }

  const before = { previousAdResourceName: params.previousAdResourceName };
  const after = { previousAdResourceName: params.previousAdResourceName, responsiveSearchAd: params.responsiveSearchAd };
  const status: AutomationActionStatus = violations.length > 0 ? 'blocked' : 'awaiting_approval';

  const action = new AutomationActionModel();
  action.organization_id = params.organizationId;
  action.project_id = params.projectId;
  action.environment_id = target.environment_id;
  action.action_type = 'ad_edit';
  action.target_id = params.targetId;
  action.target_label = target.label;
  action.before = before;
  action.after = after;
  action.status = status;
  action.guardrail_violations = violations;
  action.requested_by_user_id = params.requestedByUserId;
  action.proposed_at = now.toISOString();
  action.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: target.environment_id,
    actorType: 'user',
    actorId: params.requestedByUserId,
    action: 'automation_action.propose',
    targetId: action.id,
    summary:
      status === 'blocked'
        ? `Proposed an ad edit for "${target.label}" — blocked by ${violations.length} guardrail(s)`
        : `Proposed an ad edit for "${target.label}"`,
    before,
    after,
  });

  return action;
}

export interface ProposeMetaAdSetEditActionParams {
  organizationId: string;
  projectId: string;
  targetId: string;
  adSetResourceName: string;
  /** Omit to leave the ad set's daily budget untouched. */
  dailyBudgetUsd?: number;
  /** Omit to leave the ad set's status untouched. */
  status?: MetaAdSetStatus;
  requestedByUserId: string;
  now?: Date;
}

/**
 * KAN-73 follow-up's dry-run-diff step for editing an already-created Meta ad
 * set's budget and/or status ("post-creation ad-set edits", plan `13 §E21.2`'s
 * own deferred bullet — the Meta sibling of `proposeKeywordEditAction`).
 * `adSetResourceName` must be one of `target.meta_ad_set_resource_names` —
 * set by a `campaign_draft_create` action this same target already executed
 * — so a caller can never point an edit at an arbitrary ad set outside this
 * target's own campaign (same invariant `proposeKeywordEditAction`
 * established for ad groups). Unlike `keyword_edit`'s purely additive shape,
 * a budget/status edit overwrites live state, and the true pre-edit values
 * aren't known until execute time (an ad set's budget/status isn't mirrored
 * on `AutomationTargetStateModel` the way a whole campaign's is) — `before`
 * only records `adSetResourceName` here; `executeActionByType` widens it
 * post-execution with the real values `MetaAutomationActionExecutor` reads
 * live, see `AUTOMATION_ACTION_TYPES`'s own doc comment.
 */
export async function proposeMetaAdSetEditAction(params: ProposeMetaAdSetEditActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  try {
    validateMetaAdSetEditActionInput({
      adSetResourceName: params.adSetResourceName,
      dailyBudgetUsd: params.dailyBudgetUsd,
      status: params.status,
    });
  } catch (error) {
    if (error instanceof InvalidCampaignDraftError) {
      throw new InvalidAutomationActionError(error.message);
    }
    throw error;
  }

  const target = await loadTargetForAction(params.organizationId, params.projectId, params.targetId);
  if (!target.meta_ad_set_resource_names?.includes(params.adSetResourceName)) {
    throw new InvalidAutomationActionError("adSetResourceName must be one of this target's own ad sets (created by a campaign_draft_create action)");
  }

  const now = params.now ?? new Date();
  const policy = await getActiveAutomationGuardrailPolicy(params.organizationId, params.projectId);
  const actionsExecutedToday =
    policy.maxActionsPerDay !== null
      ? await countAutomationActionsExecutedToday(params.organizationId, params.projectId, now, policy.maxActionsPerDay)
      : 0;

  const violations: GuardrailViolation[] = evaluateCampaignActivationGuardrails(
    toPureGuardrailPolicy(policy),
    { targetId: params.targetId },
    { nowUtc: now, actionsExecutedToday },
  );

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    violations.push({ type: 'automation_paused', message: 'Automation is paused for this organization (kill switch engaged).' });
  }

  const tierViolation = await resolveWriteTierViolation(params.organizationId, params.projectId, target, 'manage');
  if (tierViolation) {
    violations.push(tierViolation);
  }

  const before = { adSetResourceName: params.adSetResourceName };
  const after: Record<string, unknown> = { adSetResourceName: params.adSetResourceName };
  if (params.dailyBudgetUsd !== undefined) {
    after.dailyBudgetUsd = params.dailyBudgetUsd;
  }
  if (params.status !== undefined) {
    after.adSetStatus = params.status;
  }
  const status: AutomationActionStatus = violations.length > 0 ? 'blocked' : 'awaiting_approval';

  const action = new AutomationActionModel();
  action.organization_id = params.organizationId;
  action.project_id = params.projectId;
  action.environment_id = target.environment_id;
  action.action_type = 'meta_ad_set_edit';
  action.target_id = params.targetId;
  action.target_label = target.label;
  action.before = before;
  action.after = after;
  action.status = status;
  action.guardrail_violations = violations;
  action.requested_by_user_id = params.requestedByUserId;
  action.proposed_at = now.toISOString();
  action.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: target.environment_id,
    actorType: 'user',
    actorId: params.requestedByUserId,
    action: 'automation_action.propose',
    targetId: action.id,
    summary:
      status === 'blocked'
        ? `Proposed an ad set edit for "${target.label}" — blocked by ${violations.length} guardrail(s)`
        : `Proposed an ad set edit for "${target.label}"`,
    before,
    after,
  });

  return action;
}

export interface ProposeMetaAdSetTargetingEditActionParams {
  organizationId: string;
  projectId: string;
  targetId: string;
  adSetResourceName: string;
  targeting: MetaAdSetTargetingEdit;
  requestedByUserId: string;
  now?: Date;
}

/**
 * KAN-73 follow-up's dry-run-diff step for replacing an already-created Meta
 * ad set's whole targeting spec ("ad-set targeting-spec edits", this story's
 * own deferred bullet — the direct sibling of `proposeMetaAdSetEditAction`
 * for targeting instead of budget/status). `adSetResourceName` must be one
 * of `target.meta_ad_set_resource_names` — same invariant
 * `proposeMetaAdSetEditAction` establishes for its own edit. Unlike
 * `meta_ad_set_edit`'s independently-optional budget/status fields, a
 * targeting edit always replaces the whole spec at once (see
 * `MetaAdSetTargetingEdit`'s own doc comment), and the true pre-edit spec
 * isn't known until execute time — `before` only records `adSetResourceName`
 * here; `executeActionByType` widens it post-execution with the real spec
 * `MetaAutomationActionExecutor` reads live, see `AUTOMATION_ACTION_TYPES`'s
 * own doc comment.
 */
export async function proposeMetaAdSetTargetingEditAction(params: ProposeMetaAdSetTargetingEditActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  try {
    validateMetaAdSetTargetingEditActionInput({ adSetResourceName: params.adSetResourceName, targeting: params.targeting });
  } catch (error) {
    if (error instanceof InvalidCampaignDraftError) {
      throw new InvalidAutomationActionError(error.message);
    }
    throw error;
  }

  const target = await loadTargetForAction(params.organizationId, params.projectId, params.targetId);
  if (!target.meta_ad_set_resource_names?.includes(params.adSetResourceName)) {
    throw new InvalidAutomationActionError("adSetResourceName must be one of this target's own ad sets (created by a campaign_draft_create action)");
  }

  const now = params.now ?? new Date();
  const policy = await getActiveAutomationGuardrailPolicy(params.organizationId, params.projectId);
  const actionsExecutedToday =
    policy.maxActionsPerDay !== null
      ? await countAutomationActionsExecutedToday(params.organizationId, params.projectId, now, policy.maxActionsPerDay)
      : 0;

  const violations: GuardrailViolation[] = evaluateCampaignActivationGuardrails(
    toPureGuardrailPolicy(policy),
    { targetId: params.targetId },
    { nowUtc: now, actionsExecutedToday },
  );

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    violations.push({ type: 'automation_paused', message: 'Automation is paused for this organization (kill switch engaged).' });
  }

  const tierViolation = await resolveWriteTierViolation(params.organizationId, params.projectId, target, 'manage');
  if (tierViolation) {
    violations.push(tierViolation);
  }

  const before = { adSetResourceName: params.adSetResourceName };
  const after = { adSetResourceName: params.adSetResourceName, targeting: params.targeting };
  const status: AutomationActionStatus = violations.length > 0 ? 'blocked' : 'awaiting_approval';

  const action = new AutomationActionModel();
  action.organization_id = params.organizationId;
  action.project_id = params.projectId;
  action.environment_id = target.environment_id;
  action.action_type = 'meta_ad_set_targeting_edit';
  action.target_id = params.targetId;
  action.target_label = target.label;
  action.before = before;
  action.after = after;
  action.status = status;
  action.guardrail_violations = violations;
  action.requested_by_user_id = params.requestedByUserId;
  action.proposed_at = now.toISOString();
  action.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: target.environment_id,
    actorType: 'user',
    actorId: params.requestedByUserId,
    action: 'automation_action.propose',
    targetId: action.id,
    summary:
      status === 'blocked'
        ? `Proposed an ad set targeting edit for "${target.label}" — blocked by ${violations.length} guardrail(s)`
        : `Proposed an ad set targeting edit for "${target.label}"`,
    before,
    after,
  });

  return action;
}

export interface ProposeMetaAdCreativeEditActionParams {
  organizationId: string;
  projectId: string;
  targetId: string;
  adResourceName: string;
  creative: MetaAdCreativeEditContent;
  requestedByUserId: string;
  now?: Date;
}

/**
 * KAN-73 follow-up's dry-run-diff step for replacing an already-created Meta
 * ad's primary text/headline/description ("real Meta post-creation creative
 * edit", plan `13 §E21.3`'s own deferred bullet — the Meta sibling of
 * `proposeAdEditAction`). `adResourceName` must be one of
 * `target.meta_ad_resource_names` — set by a `campaign_draft_create` action
 * this same target already executed — so a caller can never point an edit
 * at an arbitrary ad outside this target's own campaign (same invariant
 * `proposeAdEditAction` established for Google Ads ads). The ad's true
 * pre-edit creative isn't known until execute time (an ad's live creative
 * reference isn't mirrored on `AutomationTargetStateModel`) — `before` only
 * records `adResourceName` here; `executeActionByType` widens it
 * post-execution with the real value `MetaAutomationActionExecutor` reads
 * live, see `AUTOMATION_ACTION_TYPES`'s own doc comment.
 */
export async function proposeMetaAdCreativeEditAction(params: ProposeMetaAdCreativeEditActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  try {
    validateMetaAdCreativeEditActionInput({
      adResourceName: params.adResourceName,
      primaryText: params.creative.primaryText,
      headline: params.creative.headline,
      description: params.creative.description,
      linkUrl: params.creative.linkUrl,
    });
  } catch (error) {
    if (error instanceof InvalidCampaignDraftError) {
      throw new InvalidAutomationActionError(error.message);
    }
    throw error;
  }

  const target = await loadTargetForAction(params.organizationId, params.projectId, params.targetId);
  if (!target.meta_ad_resource_names?.includes(params.adResourceName)) {
    throw new InvalidAutomationActionError("adResourceName must be one of this target's own ads (created by a campaign_draft_create action)");
  }

  const now = params.now ?? new Date();
  const policy = await getActiveAutomationGuardrailPolicy(params.organizationId, params.projectId);
  const actionsExecutedToday =
    policy.maxActionsPerDay !== null
      ? await countAutomationActionsExecutedToday(params.organizationId, params.projectId, now, policy.maxActionsPerDay)
      : 0;

  const violations: GuardrailViolation[] = evaluateCampaignActivationGuardrails(
    toPureGuardrailPolicy(policy),
    { targetId: params.targetId },
    { nowUtc: now, actionsExecutedToday },
  );

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    violations.push({ type: 'automation_paused', message: 'Automation is paused for this organization (kill switch engaged).' });
  }

  const tierViolation = await resolveWriteTierViolation(params.organizationId, params.projectId, target, 'manage');
  if (tierViolation) {
    violations.push(tierViolation);
  }

  const before = { adResourceName: params.adResourceName };
  const after = { adResourceName: params.adResourceName, creative: params.creative };
  const status: AutomationActionStatus = violations.length > 0 ? 'blocked' : 'awaiting_approval';

  const action = new AutomationActionModel();
  action.organization_id = params.organizationId;
  action.project_id = params.projectId;
  action.environment_id = target.environment_id;
  action.action_type = 'meta_ad_creative_edit';
  action.target_id = params.targetId;
  action.target_label = target.label;
  action.before = before;
  action.after = after;
  action.status = status;
  action.guardrail_violations = violations;
  action.requested_by_user_id = params.requestedByUserId;
  action.proposed_at = now.toISOString();
  action.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: target.environment_id,
    actorType: 'user',
    actorId: params.requestedByUserId,
    action: 'automation_action.propose',
    targetId: action.id,
    summary:
      status === 'blocked'
        ? `Proposed an ad creative edit for "${target.label}" — blocked by ${violations.length} guardrail(s)`
        : `Proposed an ad creative edit for "${target.label}"`,
    before,
    after,
  });

  return action;
}

export interface ApproveAutomationActionParams {
  organizationId: string;
  projectId: string;
  actionId: string;
  approverId: string;
}

export async function approveAutomationAction(params: ApproveAutomationActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const action = await loadAction(params.organizationId, params.projectId, params.actionId);
  await requireStatus(action, 'awaiting_approval', 'approve');

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    throw new AutomationKillSwitchEngagedError();
  }
  await assertSufficientWriteTierForAction(params.organizationId, params.projectId, action);

  action.status = 'approved';
  action.approved_by_user_id = params.approverId;
  action.approved_at = new Date().toISOString();
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: action.environment_id,
    actorType: 'user',
    actorId: params.approverId,
    action: 'automation_action.approve',
    targetId: action.id,
    summary: `Approved ${actionSummaryVerb(action.action_type)} for "${action.target_label}"`,
  });

  return action;
}

export interface RejectAutomationActionParams {
  organizationId: string;
  projectId: string;
  actionId: string;
  rejectedByUserId: string;
}

export async function rejectAutomationAction(params: RejectAutomationActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const action = await loadAction(params.organizationId, params.projectId, params.actionId);
  if (action.status !== 'awaiting_approval' && action.status !== 'blocked') {
    throw new AutomationActionInvalidStateError(action.status, 'reject');
  }

  action.status = 'rejected';
  action.rejected_by_user_id = params.rejectedByUserId;
  action.rejected_at = new Date().toISOString();
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: action.environment_id,
    actorType: 'user',
    actorId: params.rejectedByUserId,
    action: 'automation_action.reject',
    targetId: action.id,
    summary: `Rejected ${actionSummaryVerb(action.action_type)} for "${action.target_label}"`,
  });

  return action;
}

export interface ExecuteAutomationActionParams {
  organizationId: string;
  projectId: string;
  actionId: string;
  executedByUserId: string;
  executor?: AutomationActionExecutor;
}

/** Retry/backoff config for a single executor call — same shape KAN-47's source-plugin runs already use. */
const EXECUTE_RETRY_OPTIONS = { maxAttempts: 3, baseDelayMs: 200 };

export async function executeAutomationAction(params: ExecuteAutomationActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const action = await loadAction(params.organizationId, params.projectId, params.actionId);
  await requireStatus(action, 'approved', 'execute');

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    throw new AutomationKillSwitchEngagedError();
  }
  await assertSufficientWriteTierForAction(params.organizationId, params.projectId, action);

  const executor = params.executor ?? defaultAutomationActionExecutor;
  const executionSummaryVerb = actionSummaryVerb(action.action_type);

  try {
    const attempts = await executeActionByType(executor, action, params.organizationId, params.projectId);
    action.status = 'executed';
    action.executed_at = new Date().toISOString();
    action.execute_attempts = attempts;
    await action.save();

    await auditBestEffort({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: action.environment_id,
      actorType: 'user',
      actorId: params.executedByUserId,
      action: 'automation_action.execute',
      targetId: action.id,
      summary: `Executed ${executionSummaryVerb} for "${action.target_label}"`,
      before: action.before,
      after: action.after,
    });
  } catch (error) {
    action.status = 'failed';
    action.execute_attempts = EXECUTE_RETRY_OPTIONS.maxAttempts;
    action.failure_reason = error instanceof Error ? error.message : String(error);
    await action.save();

    await auditBestEffort({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: action.environment_id,
      actorType: 'user',
      actorId: params.executedByUserId,
      action: 'automation_action.execute_failed',
      targetId: action.id,
      summary: `Failed to execute ${executionSummaryVerb} for "${action.target_label}": ${action.failure_reason}`,
    });
  }

  return action;
}

/** Dispatches an approved action's execution to the right `AutomationActionExecutor` method for its `action_type`, wrapped in the shared retry/backoff — returns how many attempts it took. */
async function executeActionByType(
  executor: AutomationActionExecutor,
  action: AutomationActionModel,
  organizationId: string,
  projectId: string,
): Promise<number> {
  if (action.action_type === 'budget_change') {
    const before = action.before as { dailyBudgetUsd: number };
    const after = action.after as { dailyBudgetUsd: number };
    const { attempts } = await runWithRetryBackoff(
      () =>
        executor.executeBudgetChange({
          organizationId,
          projectId,
          environmentId: action.environment_id,
          targetId: action.target_id,
          beforeDailyBudgetUsd: before.dailyBudgetUsd,
          afterDailyBudgetUsd: after.dailyBudgetUsd,
        }),
      EXECUTE_RETRY_OPTIONS,
    );
    return attempts;
  }

  if (action.action_type === 'campaign_draft_create') {
    const after = action.after as { campaignDraft: CampaignDraft };
    const { attempts } = await runWithRetryBackoff(
      () =>
        executor.executeCampaignDraftCreate({
          organizationId,
          projectId,
          environmentId: action.environment_id,
          targetId: action.target_id,
          draft: after.campaignDraft,
        }),
      EXECUTE_RETRY_OPTIONS,
    );
    return attempts;
  }

  if (action.action_type === 'keyword_edit') {
    const after = action.after as { adGroupResourceName: string; addKeywords: CampaignDraftKeyword[]; addNegativeKeywords: CampaignDraftKeyword[] };
    const { result, attempts } = await runWithRetryBackoff(
      () =>
        executor.executeKeywordEdit({
          organizationId,
          projectId,
          environmentId: action.environment_id,
          targetId: action.target_id,
          adGroupResourceName: after.adGroupResourceName,
          addKeywords: after.addKeywords,
          addNegativeKeywords: after.addNegativeKeywords,
        }),
      EXECUTE_RETRY_OPTIONS,
    );
    // Widens `after` with the real resource names Google Ads assigned, so `rollbackActionByType`
    // knows exactly which criteria to remove — see `AUTOMATION_ACTION_TYPES`'s own doc comment.
    action.after = {
      ...after,
      addedKeywordResourceNames: result.addedKeywordResourceNames,
      addedNegativeKeywordResourceNames: result.addedNegativeKeywordResourceNames,
    };
    return attempts;
  }

  if (action.action_type === 'ad_edit') {
    const after = action.after as { previousAdResourceName: string; responsiveSearchAd: AdEditResponsiveSearchAdContent };
    const { result, attempts } = await runWithRetryBackoff(
      () =>
        executor.executeAdEdit({
          organizationId,
          projectId,
          environmentId: action.environment_id,
          targetId: action.target_id,
          previousAdResourceName: after.previousAdResourceName,
          responsiveSearchAd: after.responsiveSearchAd,
        }),
      EXECUTE_RETRY_OPTIONS,
    );
    // Widens `after` with the real resource name Google Ads assigned the replacement ad, so
    // `rollbackActionByType` knows exactly which ad to remove and which to restore.
    action.after = { ...after, newAdResourceName: result.newAdResourceName };
    return attempts;
  }

  if (action.action_type === 'meta_ad_set_edit') {
    const before = action.before as { adSetResourceName: string };
    const after = action.after as { adSetResourceName: string; dailyBudgetUsd?: number; adSetStatus?: MetaAdSetStatus };
    const { result, attempts } = await runWithRetryBackoff(
      () =>
        executor.executeMetaAdSetEdit({
          organizationId,
          projectId,
          environmentId: action.environment_id,
          targetId: action.target_id,
          adSetResourceName: after.adSetResourceName,
          ...(after.dailyBudgetUsd !== undefined ? { dailyBudgetUsd: after.dailyBudgetUsd } : {}),
          ...(after.adSetStatus !== undefined ? { status: after.adSetStatus } : {}),
        }),
      EXECUTE_RETRY_OPTIONS,
    );
    // Widens `before` (not `after` — see `AUTOMATION_ACTION_TYPES`'s own doc comment) with the
    // real pre-edit values Meta reported, so `rollbackActionByType` knows exactly what state to
    // restore — the mirror image of `keyword_edit`'s own post-execution `after`-widening above.
    action.before = {
      ...before,
      ...(result.previousDailyBudgetUsd !== undefined ? { dailyBudgetUsd: result.previousDailyBudgetUsd } : {}),
      ...(result.previousStatus !== undefined ? { adSetStatus: result.previousStatus } : {}),
    };
    return attempts;
  }

  if (action.action_type === 'meta_ad_set_targeting_edit') {
    const before = action.before as { adSetResourceName: string };
    const after = action.after as { adSetResourceName: string; targeting: MetaAdSetTargetingEdit };
    const { result, attempts } = await runWithRetryBackoff(
      () =>
        executor.executeMetaAdSetTargetingEdit({
          organizationId,
          projectId,
          environmentId: action.environment_id,
          targetId: action.target_id,
          adSetResourceName: after.adSetResourceName,
          targeting: after.targeting,
        }),
      EXECUTE_RETRY_OPTIONS,
    );
    // Widens `before` (not `after` — see `AUTOMATION_ACTION_TYPES`'s own doc comment) with the
    // real pre-edit targeting spec Meta reported, so `rollbackActionByType` knows exactly what
    // spec to restore — the mirror image of `keyword_edit`'s own post-execution `after`-widening.
    action.before = { ...before, targeting: result.previousTargeting };
    return attempts;
  }

  if (action.action_type === 'meta_ad_creative_edit') {
    const before = action.before as { adResourceName: string };
    const after = action.after as { adResourceName: string; creative: MetaAdCreativeEditContent };
    const { result, attempts } = await runWithRetryBackoff(
      () =>
        executor.executeMetaAdCreativeEdit({
          organizationId,
          projectId,
          environmentId: action.environment_id,
          targetId: action.target_id,
          adResourceName: after.adResourceName,
          creative: after.creative,
        }),
      EXECUTE_RETRY_OPTIONS,
    );
    // Widens `after` with the new creative Meta created and `before` with the real pre-edit
    // creative it reported live, so `rollbackActionByType` knows exactly which creative to
    // repoint the ad back to — see `AUTOMATION_ACTION_TYPES`'s own doc comment.
    action.after = { ...after, newCreativeResourceName: result.newCreativeResourceName };
    action.before = { ...before, previousCreativeResourceName: result.previousCreativeResourceName };
    return attempts;
  }

  const target = await loadTargetForAction(organizationId, projectId, action.target_id);
  if (!target.campaign_resource_name) {
    throw new InvalidAutomationActionError('this target has no campaign resource name to activate');
  }
  const { attempts } = await runWithRetryBackoff(
    () =>
      executor.executeCampaignActivation({
        organizationId,
        projectId,
        environmentId: action.environment_id,
        targetId: action.target_id,
        campaignResourceName: target.campaign_resource_name as string,
      }),
    EXECUTE_RETRY_OPTIONS,
  );
  return attempts;
}

export interface RollbackAutomationActionParams {
  organizationId: string;
  projectId: string;
  actionId: string;
  reason: 'manual' | 'guardrail_regression';
  actorId?: string;
  executor?: AutomationActionExecutor;
}

/**
 * Restores a target to its pre-action state (KAN-71's "rollback restores
 * prior state" AC) — callable directly (a human undoing an executed/verified
 * action) or from {@link verifyAutomationAction} when a guarded metric
 * regressed past the policy's threshold.
 */
export async function rollbackAutomationAction(params: RollbackAutomationActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const action = await loadAction(params.organizationId, params.projectId, params.actionId);
  if (action.status !== 'executed' && action.status !== 'verified') {
    throw new AutomationActionInvalidStateError(action.status, 'roll back');
  }

  const executor = params.executor ?? defaultAutomationActionExecutor;
  await rollbackActionByType(executor, action, params.organizationId, params.projectId);

  action.status = 'rolled_back';
  action.rolled_back_at = new Date().toISOString();
  action.rollback_reason = params.reason;
  if (params.actorId !== undefined) {
    action.rolled_back_by_user_id = params.actorId;
  }
  await action.save();

  const rollbackSummaryVerb = actionSummaryVerb(action.action_type);

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: action.environment_id,
    actorType: params.actorId !== undefined ? 'user' : 'system',
    actorId: params.actorId ?? 'automation-verify-worker',
    action: 'automation_action.rollback',
    targetId: action.id,
    summary: `Rolled back ${rollbackSummaryVerb} for "${action.target_label}" (${params.reason})`,
    before: action.after,
    after: action.before,
  });

  return action;
}

/** Dispatches a rollback to the right `AutomationActionExecutor` method for the action's `action_type`. */
async function rollbackActionByType(
  executor: AutomationActionExecutor,
  action: AutomationActionModel,
  organizationId: string,
  projectId: string,
): Promise<void> {
  if (action.action_type === 'budget_change') {
    const before = action.before as { dailyBudgetUsd: number };
    const after = action.after as { dailyBudgetUsd: number };
    await executor.rollbackBudgetChange({
      organizationId,
      projectId,
      environmentId: action.environment_id,
      targetId: action.target_id,
      beforeDailyBudgetUsd: before.dailyBudgetUsd,
      afterDailyBudgetUsd: after.dailyBudgetUsd,
    });
    return;
  }

  if (action.action_type === 'keyword_edit') {
    const after = action.after as { addedKeywordResourceNames?: string[]; addedNegativeKeywordResourceNames?: string[] };
    await executor.rollbackKeywordEdit({
      organizationId,
      projectId,
      environmentId: action.environment_id,
      targetId: action.target_id,
      addedKeywordResourceNames: after.addedKeywordResourceNames ?? [],
      addedNegativeKeywordResourceNames: after.addedNegativeKeywordResourceNames ?? [],
    });
    return;
  }

  if (action.action_type === 'ad_edit') {
    const before = action.before as { previousAdResourceName: string };
    const after = action.after as { newAdResourceName?: string };
    if (!after.newAdResourceName) {
      throw new InvalidAutomationActionError('this ad_edit action has no new ad resource name to roll back (it never finished executing)');
    }
    await executor.rollbackAdEdit({
      organizationId,
      projectId,
      environmentId: action.environment_id,
      targetId: action.target_id,
      previousAdResourceName: before.previousAdResourceName,
      newAdResourceName: after.newAdResourceName,
    });
    return;
  }

  if (action.action_type === 'meta_ad_set_edit') {
    const before = action.before as { adSetResourceName: string; dailyBudgetUsd?: number; adSetStatus?: MetaAdSetStatus };
    await executor.rollbackMetaAdSetEdit({
      organizationId,
      projectId,
      environmentId: action.environment_id,
      targetId: action.target_id,
      adSetResourceName: before.adSetResourceName,
      ...(before.dailyBudgetUsd !== undefined ? { beforeDailyBudgetUsd: before.dailyBudgetUsd } : {}),
      ...(before.adSetStatus !== undefined ? { beforeStatus: before.adSetStatus } : {}),
    });
    return;
  }

  if (action.action_type === 'meta_ad_set_targeting_edit') {
    const before = action.before as { adSetResourceName: string; targeting?: MetaAdSetTargetingEdit };
    if (!before.targeting) {
      throw new InvalidAutomationActionError('this meta_ad_set_targeting_edit action has no previous targeting spec to roll back (it never finished executing)');
    }
    await executor.rollbackMetaAdSetTargetingEdit({
      organizationId,
      projectId,
      environmentId: action.environment_id,
      targetId: action.target_id,
      adSetResourceName: before.adSetResourceName,
      previousTargeting: before.targeting,
    });
    return;
  }

  if (action.action_type === 'meta_ad_creative_edit') {
    const before = action.before as { adResourceName: string; previousCreativeResourceName?: string };
    const after = action.after as { newCreativeResourceName?: string };
    if (!before.previousCreativeResourceName || !after.newCreativeResourceName) {
      throw new InvalidAutomationActionError('this meta_ad_creative_edit action has no creative resource names to roll back (it never finished executing)');
    }
    await executor.rollbackMetaAdCreativeEdit({
      organizationId,
      projectId,
      environmentId: action.environment_id,
      targetId: action.target_id,
      adResourceName: before.adResourceName,
      previousCreativeResourceName: before.previousCreativeResourceName,
      newCreativeResourceName: after.newCreativeResourceName,
    });
    return;
  }

  const target = await loadTargetForAction(organizationId, projectId, action.target_id);
  if (!target.campaign_resource_name) {
    throw new InvalidAutomationActionError('this target has no campaign resource name to roll back');
  }

  if (action.action_type === 'campaign_draft_create') {
    await executor.rollbackCampaignDraftCreate({
      organizationId,
      projectId,
      environmentId: action.environment_id,
      targetId: action.target_id,
      campaignResourceName: target.campaign_resource_name,
    });
    return;
  }

  await executor.rollbackCampaignActivation({
    organizationId,
    projectId,
    environmentId: action.environment_id,
    targetId: action.target_id,
    campaignResourceName: target.campaign_resource_name,
  });
}

export interface VerifyAutomationActionParams {
  organizationId: string;
  projectId: string;
  actionId: string;
  verifiedByUserId: string;
  /**
   * The guarded business metric's observed before/after values, if the
   * caller has them (a real KAN-72/73 connector, or a human pasting numbers
   * from the ad platform's own dashboard today). Omit to just record
   * "looks fine" with no auto-rollback check. Direction convention: higher
   * is assumed better, so a *drop* from before to after is a regression.
   */
  guardedMetricBefore?: number;
  guardedMetricAfter?: number;
  executor?: AutomationActionExecutor;
}

/**
 * KAN-71's verify step — if a guarded metric's observed before/after values
 * are supplied and the metric worsened past the policy's
 * `maxGuardedMetricRegressionPct` threshold, auto-rolls back and marks the
 * action `rolled_back` (plan `06 §7`: "if a guarded metric worsens past
 * threshold after an action, revert and alert"); otherwise marks it
 * `verified`.
 */
export async function verifyAutomationAction(params: VerifyAutomationActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const action = await loadAction(params.organizationId, params.projectId, params.actionId);
  await requireStatus(action, 'executed', 'verify');

  const hasGuardedMetric = params.guardedMetricBefore !== undefined && params.guardedMetricAfter !== undefined;
  if (hasGuardedMetric && (!Number.isFinite(params.guardedMetricBefore) || !Number.isFinite(params.guardedMetricAfter))) {
    throw new InvalidAutomationActionError('guardedMetricBefore/guardedMetricAfter must be finite numbers');
  }
  let regressionPct: number | undefined;
  if (hasGuardedMetric) {
    const guardedBefore = params.guardedMetricBefore as number;
    const guardedAfter = params.guardedMetricAfter as number;
    regressionPct = guardedBefore === 0 ? 0 : ((guardedBefore - guardedAfter) / guardedBefore) * 100;
  }

  const policy = await getActiveAutomationGuardrailPolicy(params.organizationId, params.projectId);
  const breached =
    hasGuardedMetric && policy.maxGuardedMetricRegressionPct !== null && (regressionPct as number) > policy.maxGuardedMetricRegressionPct;

  if (breached) {
    action.verified_at = new Date().toISOString();
    action.guarded_metric_regression_pct = regressionPct;
    await action.save();
    return rollbackAutomationAction({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actionId: params.actionId,
      reason: 'guardrail_regression',
      executor: params.executor,
    });
  }

  action.status = 'verified';
  action.verified_at = new Date().toISOString();
  if (regressionPct !== undefined) {
    action.guarded_metric_regression_pct = regressionPct;
  }
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: action.environment_id,
    actorType: 'user',
    actorId: params.verifiedByUserId,
    action: 'automation_action.verify',
    targetId: action.id,
    summary: `Verified ${actionSummaryVerb(action.action_type)} for "${action.target_label}"`,
  });

  return action;
}

/** A project's automation action queue/history, newest-proposal-first. */
export async function listAutomationActionsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_ACTION_LIST_LIMIT,
): Promise<AutomationActionModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  return AutomationActionModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .orderBy('proposed_at', 'desc')
    .limit(limit)
    .get();
}

/**
 * One target's full action history, newest first — the campaign detail
 * page's timeline (every budget change / draft / activation / rollback that
 * ever touched this campaign, with its before/after diff). Compound query
 * (`target_id` equality + `proposed_at` order): needs the composite index
 * declared in `firestore.indexes.json` (added in the same PR, per the
 * standing rule there — the emulator does not enforce composite indexes,
 * so only that file and the live project know about it).
 */
export async function listAutomationActionsForTarget(
  organizationId: string,
  projectId: string,
  targetId: string,
  limit: number = DEFAULT_ACTION_LIST_LIMIT,
): Promise<AutomationActionModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  return AutomationActionModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .where('target_id', '==', targetId)
    .orderBy('proposed_at', 'desc')
    .limit(limit)
    .get();
}

export interface RefreshAutomationTargetStateParams {
  organizationId: string;
  projectId: string;
  targetId: string;
  /** The provider-resolved executor (see `resolveAutomationActionExecutorForTarget`) — defaults to the simulated one, same fallback every execute path takes. */
  executor?: AutomationActionExecutor;
  refreshedByUserId: string;
}

/**
 * The read seam's service verb (KAN-43 groundwork): asks the target's own
 * executor to read the campaign's state as the ad platform reports it right
 * now — the executor itself persists what it read (`campaign_status`,
 * `daily_budget_usd`, `last_read_state_at`; see
 * `AutomationActionExecutor.readCampaignState`'s own doc comment for why
 * this is the one executor write that needs no approved action) — and
 * returns the refreshed target row.
 */
export async function refreshAutomationTargetState(params: RefreshAutomationTargetStateParams): Promise<AutomationTargetStateModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const target = await AutomationTargetStateModel.init(params.targetId, {
    organization_id: params.organizationId,
    project_id: params.projectId,
  });
  if (!target || target.project_id !== params.projectId) {
    throw new AutomationTargetNotFoundError(params.targetId);
  }

  const executor = params.executor ?? defaultAutomationActionExecutor;
  await executor.readCampaignState({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: target.environment_id,
    targetId: params.targetId,
  });

  const refreshed = await AutomationTargetStateModel.init(params.targetId, {
    organization_id: params.organizationId,
    project_id: params.projectId,
  });

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: target.environment_id,
      actorType: 'user',
      actorId: params.refreshedByUserId,
      action: 'automation_target.refresh_state',
      targetType: 'automation_target',
      targetId: params.targetId,
      summary: `Refreshed live platform state for automation target "${target.label}"`,
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return refreshed ?? target;
}

/** One ad exactly as the ad platform reported it at import/sync time — stored verbatim (JSON, see `AutomationTargetStateModel.imported_ads_json`) and rendered by the campaign detail page's creatives panel for a campaign GrowthOS didn't create. All content fields optional: a platform report can omit any of them. */
export interface ImportedAdSnapshot {
  adSetName?: string;
  adName: string;
  /** The platform's own status vocabulary as observed (e.g. Meta's `PAUSED`) — displayed verbatim, never interpreted. */
  status?: string;
  headline?: string;
  primaryText?: string;
  description?: string;
  linkUrl?: string;
  imageUrl?: string;
  callToActionType?: string;
}

/** One live campaign as observed on a real ad platform, for import/sync into a target row (`importExternalCampaignSnapshots`). */
export interface ExternalCampaignSnapshotInput {
  /** The platform's own campaign id/resource name — becomes `campaign_resource_name` verbatim (the target's document id is a sanitized derivation of it). */
  externalCampaignId: string;
  platform: ExternalAdPlatform;
  name: string;
  status: CampaignStatus;
  dailyBudgetUsd: number;
  objective?: string;
  ads: ImportedAdSnapshot[];
}

export interface ImportExternalCampaignSnapshotsParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  snapshots: ExternalCampaignSnapshotInput[];
  importedByUserId: string;
}

export interface ImportExternalCampaignSnapshotsResult {
  created: number;
  updated: number;
  targetIds: string[];
}

/** Bounds one import call (and thereby each target's `imported_ads_json` size — see that field's own doc comment). */
const MAX_IMPORT_SNAPSHOTS = 100;
const MAX_IMPORT_ADS_PER_CAMPAIGN = 50;
const MAX_IMPORT_STRING_LENGTH = 2000;

function validateImportString(value: unknown, field: string, required: boolean): void {
  if (value === undefined) {
    if (required) {
      throw new InvalidAutomationActionError(`${field} is required`);
    }
    return;
  }
  if (typeof value !== 'string' || (required && value.trim().length === 0) || value.length > MAX_IMPORT_STRING_LENGTH) {
    throw new InvalidAutomationActionError(`${field} must be a non-empty string of at most ${MAX_IMPORT_STRING_LENGTH} characters`);
  }
}

/** A target document id derived from a platform campaign id — Firestore document ids cannot contain `/` (present in every Google Ads resource name), so anything outside a safe charset collapses to `_`. The raw external id is preserved verbatim in `campaign_resource_name`. */
function importedTargetId(platform: ExternalAdPlatform, externalCampaignId: string): string {
  return `${platform}_${externalCampaignId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/**
 * Campaign discovery/sync (the read-direction sibling of the propose->approve->
 * execute write path): upserts one target row per observed live campaign,
 * recording the platform's own state (`campaign_status`, budget, ads
 * snapshot) with `last_read_state_at` — never proposing or executing
 * anything. Until KAN-43 lets the app's own executors pull this (see
 * `AutomationActionExecutor.readCampaignState`), the observations arrive
 * pushed from a connector/agent that CAN read the platform; either way the
 * write is pure observation, the same legality reasoning as the read seam's.
 */
export async function importExternalCampaignSnapshots(
  params: ImportExternalCampaignSnapshotsParams,
): Promise<ImportExternalCampaignSnapshotsResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  if (!Array.isArray(params.snapshots) || params.snapshots.length === 0 || params.snapshots.length > MAX_IMPORT_SNAPSHOTS) {
    throw new InvalidAutomationActionError(`snapshots must be a non-empty array of at most ${MAX_IMPORT_SNAPSHOTS} campaigns`);
  }
  for (const snapshot of params.snapshots) {
    validateImportString(snapshot.externalCampaignId, 'externalCampaignId', true);
    validateImportString(snapshot.name, 'name', true);
    validateImportString(snapshot.objective, 'objective', false);
    if (!EXTERNAL_AD_PLATFORMS.includes(snapshot.platform)) {
      throw new InvalidAutomationActionError(`platform must be one of: ${EXTERNAL_AD_PLATFORMS.join(', ')}`);
    }
    if (!CAMPAIGN_STATUSES.includes(snapshot.status)) {
      throw new InvalidAutomationActionError(`status must be one of: ${CAMPAIGN_STATUSES.join(', ')}`);
    }
    if (!Number.isFinite(snapshot.dailyBudgetUsd) || snapshot.dailyBudgetUsd < 0) {
      throw new InvalidAutomationActionError('dailyBudgetUsd must be a non-negative number');
    }
    if (!Array.isArray(snapshot.ads) || snapshot.ads.length > MAX_IMPORT_ADS_PER_CAMPAIGN) {
      throw new InvalidAutomationActionError(`ads must be an array of at most ${MAX_IMPORT_ADS_PER_CAMPAIGN} ads`);
    }
    for (const ad of snapshot.ads) {
      validateImportString(ad.adName, 'ads[].adName', true);
      validateImportString(ad.adSetName, 'ads[].adSetName', false);
      validateImportString(ad.status, 'ads[].status', false);
      validateImportString(ad.headline, 'ads[].headline', false);
      validateImportString(ad.primaryText, 'ads[].primaryText', false);
      validateImportString(ad.description, 'ads[].description', false);
      validateImportString(ad.linkUrl, 'ads[].linkUrl', false);
      validateImportString(ad.imageUrl, 'ads[].imageUrl', false);
      validateImportString(ad.callToActionType, 'ads[].callToActionType', false);
    }
  }

  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  const targetIds: string[] = [];
  for (const snapshot of params.snapshots) {
    const targetId = importedTargetId(snapshot.platform, snapshot.externalCampaignId);
    targetIds.push(targetId);
    const existing = await AutomationTargetStateModel.init(targetId, {
      organization_id: params.organizationId,
      project_id: params.projectId,
    });
    const target = existing && existing.project_id === params.projectId ? existing : new AutomationTargetStateModel();
    const isNew = target !== existing;
    if (isNew) {
      target.organization_id = params.organizationId;
      target.project_id = params.projectId;
      target.environment_id = params.environmentId;
      target.target_type = 'campaign';
      target.seeded_at = now;
      target.updated_at = now;
      target.seeded_by_user_id = params.importedByUserId;
      target.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
    }
    target.label = snapshot.name;
    target.daily_budget_usd = snapshot.dailyBudgetUsd;
    target.campaign_resource_name = snapshot.externalCampaignId;
    target.campaign_status = snapshot.status;
    target.external_platform = snapshot.platform;
    target.imported_ads_json = JSON.stringify({ objective: snapshot.objective, ads: snapshot.ads });
    target.last_read_state_at = now;
    await target.save(isNew ? targetId : undefined);
    if (isNew) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: params.environmentId,
      actorType: 'user',
      actorId: params.importedByUserId,
      action: 'automation_target.import_snapshots',
      targetType: 'automation_target',
      targetId: targetIds[0] ?? 'none',
      summary: `Imported ${params.snapshots.length} live campaign snapshot(s) from the ad platform (${created} new, ${updated} updated)`,
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return { created, updated, targetIds };
}
