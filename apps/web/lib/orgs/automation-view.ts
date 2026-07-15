import type {
  AutomationActionModel,
  AutomationActionStatus,
  AutomationGuardrailPolicyConfig,
  AutomationKillSwitchStatus,
  AutomationTargetStateModel,
  CampaignStatus,
  ConnectionWriteTier,
  GuardrailViolationType,
  ResourceAttachmentModel,
  SharedCredentialModel,
} from '@growthos/firebase-orm-models';

/** A plain, serializable projection of a project's effective automation guardrail policy — client components can only ever receive plain data across the RSC boundary, same reasoning as `toProjectCostQuotaView`. */
export interface AutomationGuardrailPolicyView {
  maxDailyBudgetChangePct: number | null;
  spendCeilingUsd: number | null;
  protectedTargetIds: string[];
  allowedHoursStartHourUtc: number | null;
  allowedHoursEndHourUtc: number | null;
  maxActionsPerDay: number | null;
  maxGuardedMetricRegressionPct: number | null;
  setAt: string | null;
}

export function toAutomationGuardrailPolicyView(policy: AutomationGuardrailPolicyConfig): AutomationGuardrailPolicyView {
  return {
    maxDailyBudgetChangePct: policy.maxDailyBudgetChangePct,
    spendCeilingUsd: policy.spendCeilingUsd,
    protectedTargetIds: policy.protectedTargetIds,
    allowedHoursStartHourUtc: policy.allowedHours?.startHourUtc ?? null,
    allowedHoursEndHourUtc: policy.allowedHours?.endHourUtc ?? null,
    maxActionsPerDay: policy.maxActionsPerDay,
    maxGuardedMetricRegressionPct: policy.maxGuardedMetricRegressionPct,
    setAt: policy.setAt,
  };
}

export type { AutomationKillSwitchStatus };

export interface AutomationTargetView {
  id: string;
  targetType: string;
  label: string;
  dailyBudgetUsd: number;
  environmentId: string;
  resourceAttachmentId?: string;
  campaignResourceName?: string;
  campaignStatus?: CampaignStatus;
}

export function toAutomationTargetView(target: AutomationTargetStateModel): AutomationTargetView {
  return {
    id: target.id,
    targetType: target.target_type,
    label: target.label,
    dailyBudgetUsd: target.daily_budget_usd,
    environmentId: target.environment_id,
    ...(target.resource_attachment_id !== undefined ? { resourceAttachmentId: target.resource_attachment_id } : {}),
    ...(target.campaign_resource_name !== undefined ? { campaignResourceName: target.campaign_resource_name } : {}),
    ...(target.campaign_status !== undefined ? { campaignStatus: target.campaign_status } : {}),
  };
}

/** One of a project's approved `credential` connections (KAN-27), for the seed-target form's KAN-74 connection picker. */
export interface AutomationConnectionOption {
  id: string;
  label: string;
  tier: ConnectionWriteTier;
}

/** Labels each approved credential attachment with its credential's own name — the project may only ever see its own attachment's `write_tier`, never another project's slice of the same shared credential. */
export function toAutomationConnectionOptions(
  attachments: readonly ResourceAttachmentModel[],
  credentials: readonly SharedCredentialModel[],
): AutomationConnectionOption[] {
  const credentialNameById = new Map(credentials.map((credential) => [credential.id, credential.name]));
  return attachments
    .filter((attachment) => attachment.resource_kind === 'credential')
    .map((attachment) => ({
      id: attachment.id,
      label: credentialNameById.get(attachment.resource_id) ?? attachment.resource_id,
      tier: attachment.write_tier,
    }));
}

/** One row of an action's before/after diff — generic over any action type's payload shape, not just today's single `dailyBudgetUsd` field (KAN-74's "every action browsable with diff" AC). */
export interface AutomationActionDiffEntry {
  key: string;
  before: unknown;
  after: unknown;
}

/**
 * A `campaignDraft` diff value is a whole {@link CampaignDraft} object —
 * `String(...)` on it would render `[object Object]`, so it gets a compact
 * human summary instead. Every other diff field's value is a plain
 * string/number/undefined, which `String(...)` already renders sensibly.
 * `CampaignDraft` is a `platform`-discriminated union (KAN-73): a Google Ads
 * draft's `adGroups` is `undefined` on a Meta draft (and vice versa for
 * `adSets`), which would silently degrade to "0 ad group(s)" for a Meta
 * draft if left unbranched — so this branches on `platform` explicitly
 * rather than relying on that degradation.
 */
function formatDiffValue(key: string, value: unknown): unknown {
  if (key !== 'campaignDraft' || typeof value !== 'object' || value === null) {
    return value;
  }
  const draft = value as { campaignName?: unknown; dailyBudgetUsd?: unknown; platform?: unknown; adGroups?: unknown[]; adSets?: unknown[] };
  const nameAndBudget = `"${String(draft.campaignName)}" ($${String(draft.dailyBudgetUsd)}/day`;
  if (draft.platform === 'meta') {
    const adSetCount = Array.isArray(draft.adSets) ? draft.adSets.length : 0;
    return `${nameAndBudget}, Meta, ${adSetCount} ad set(s))`;
  }
  const adGroupCount = Array.isArray(draft.adGroups) ? draft.adGroups.length : 0;
  return `${nameAndBudget}, ${adGroupCount} ad group(s))`;
}

function toDiffEntries(before: Record<string, unknown>, after: Record<string, unknown>): AutomationActionDiffEntry[] {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys.map((key) => ({ key, before: formatDiffValue(key, before[key]), after: formatDiffValue(key, after[key]) }));
}

/** The `Automation` translation key for a known diff field name — `undefined` for a field this codebase hasn't labeled yet (a future action type's own field), in which case the raw key is shown as-is rather than blocking the whole diff row. */
const DIFF_FIELD_LABEL_KEYS: Record<string, string> = {
  dailyBudgetUsd: 'diffFieldDailyBudgetUsd',
  campaignDraft: 'diffFieldCampaignDraft',
  status: 'diffFieldCampaignStatus',
};

export function diffFieldLabelKey(key: string): string | undefined {
  return DIFF_FIELD_LABEL_KEYS[key];
}

export interface AutomationActionView {
  id: string;
  targetId: string;
  targetLabel: string;
  diffEntries: AutomationActionDiffEntry[];
  status: AutomationActionStatus;
  guardrailViolations: { type: GuardrailViolationType; message: string }[];
  proposedAt: string;
  executedAt?: string;
  failureReason?: string;
  rollbackReason?: string;
}

export function toAutomationActionView(action: AutomationActionModel): AutomationActionView {
  return {
    id: action.id,
    targetId: action.target_id,
    targetLabel: action.target_label,
    diffEntries: toDiffEntries(action.before, action.after),
    status: action.status,
    guardrailViolations: action.guardrail_violations,
    proposedAt: action.proposed_at,
    ...(action.executed_at !== undefined ? { executedAt: action.executed_at } : {}),
    ...(action.failure_reason !== undefined ? { failureReason: action.failure_reason } : {}),
    ...(action.rollback_reason !== undefined ? { rollbackReason: action.rollback_reason } : {}),
  };
}

/** The `Automation` translation key for one action's status badge. */
const STATUS_LABEL_KEYS: Record<AutomationActionStatus, string> = {
  proposed: 'statusProposed',
  blocked: 'statusBlocked',
  awaiting_approval: 'statusAwaitingApproval',
  rejected: 'statusRejected',
  approved: 'statusApproved',
  executed: 'statusExecuted',
  failed: 'statusFailed',
  verified: 'statusVerified',
  rolled_back: 'statusRolledBack',
};

export function actionStatusLabelKey(status: AutomationActionStatus): string {
  return STATUS_LABEL_KEYS[status];
}

/** The `Automation` translation key for one guardrail violation type. */
const VIOLATION_LABEL_KEYS: Record<GuardrailViolationType, string> = {
  max_daily_change_pct: 'violationMaxDailyChangePct',
  spend_ceiling: 'violationSpendCeiling',
  protected_target: 'violationProtectedTarget',
  outside_allowed_hours: 'violationOutsideAllowedHours',
  blast_radius: 'violationBlastRadius',
  automation_paused: 'violationAutomationPaused',
  insufficient_write_tier: 'violationInsufficientWriteTier',
};

export function violationLabelKey(type: GuardrailViolationType): string {
  return VIOLATION_LABEL_KEYS[type];
}
