import type {
  AutomationActionModel,
  CampaignDraft,
  AutomationActionStatus,
  AutomationGuardrailPolicyConfig,
  AutomationKillSwitchStatus,
  AutomationTargetStateModel,
  CampaignStatus,
  ConnectionWriteTier,
  ExternalAdPlatform,
  ImportedAdSnapshot,
  GuardrailViolationType,
  CredentialProvider,
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
  campaignBudgetResourceName?: string;
  campaignStatus?: CampaignStatus;
  /** Last time an executed action touched this target's state — the campaign pages' "last known state as of" stamp. */
  updatedAt?: string;
  /** Last time the state was recorded as the ad platform itself reported it (a `readCampaignState` refresh or a campaign import/sync) — when present, the campaign pages show "synced from the platform" instead of the executed-actions stand-in note. */
  lastReadStateAt?: string;
  /** The real ad platform an imported/synced campaign lives on — the platform badge prefers this over the linked connection's provider (an imported campaign has no connection yet). */
  externalPlatform?: ExternalAdPlatform;
  /** The campaign's own ads exactly as the platform reported them at import/sync time — parsed from `imported_ads_json`; absent (not empty) when the target was never imported. */
  importedAds?: ImportedAdView[];
  /** The platform's own campaign objective as observed at import/sync time (e.g. Meta's `OUTCOME_LEADS`). */
  importedObjective?: string;
  adGroupResourceNames?: string[];
  /** Same order as {@link adGroupResourceNames} — `adResourceNames[i]` is the current RSA for `adGroupResourceNames[i]`. See `AutomationTargetStateModel.ad_resource_names`'s own doc comment. */
  adResourceNames?: string[];
  metaAdSetResourceNames?: string[];
  /** Same order as {@link metaAdSetResourceNames} — `metaAdResourceNames[i]` is the current ad for `metaAdSetResourceNames[i]`. See `AutomationTargetStateModel.meta_ad_resource_names`'s own doc comment. */
  metaAdResourceNames?: string[];
}

/** One imported ad as the campaign detail page renders it — a plain serializable mirror of the service layer's `ImportedAdSnapshot` (client components can only receive plain data across the RSC boundary, same reasoning as `AutomationGuardrailPolicyView`). */
export type ImportedAdView = ImportedAdSnapshot;

/**
 * Parses a target's `imported_ads_json` (written only by
 * `importExternalCampaignSnapshots`, so the shape is trusted — but a
 * malformed document degrades to "no imported ads" rather than crashing the
 * page, same defensive posture as `formatDiffValue`'s own unknown-shape
 * branches).
 */
function parseImportedAds(raw: string | undefined): { ads?: ImportedAdView[]; objective?: string } {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as { ads?: unknown; objective?: unknown };
    const ads = Array.isArray(parsed.ads) ? (parsed.ads as ImportedAdView[]) : undefined;
    const objective = typeof parsed.objective === 'string' ? parsed.objective : undefined;
    return { ...(ads !== undefined ? { ads } : {}), ...(objective !== undefined ? { objective } : {}) };
  } catch {
    return {};
  }
}

/**
 * `updated_at` is one of @arbel/firebase-orm's reserved `BaseModel` fields:
 * every `.save()` overwrites it with `Date.getTime()` (a number), regardless
 * of the ISO string the service assigned — so a target row read back carries
 * an epoch number there while the fields this codebase owns outright (e.g.
 * `last_read_state_at`) keep their ISO string. Normalizing here keeps the
 * pages from rendering a raw epoch at the reader.
 */
function toIsoTimestamp(value: string | number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }
  const asNumber = Number(value);
  return Number.isFinite(asNumber) && value.trim() !== '' && !value.includes('-') ? new Date(asNumber).toISOString() : value;
}

export function toAutomationTargetView(target: AutomationTargetStateModel): AutomationTargetView {
  const imported = parseImportedAds(target.imported_ads_json);
  return {
    ...(imported.ads !== undefined ? { importedAds: imported.ads } : {}),
    ...(imported.objective !== undefined ? { importedObjective: imported.objective } : {}),
    ...(target.last_read_state_at !== undefined ? { lastReadStateAt: toIsoTimestamp(target.last_read_state_at) } : {}),
    ...(target.external_platform !== undefined ? { externalPlatform: target.external_platform } : {}),
    id: target.id,
    targetType: target.target_type,
    label: target.label,
    dailyBudgetUsd: target.daily_budget_usd,
    environmentId: target.environment_id,
    ...(target.resource_attachment_id !== undefined ? { resourceAttachmentId: target.resource_attachment_id } : {}),
    ...(target.campaign_resource_name !== undefined ? { campaignResourceName: target.campaign_resource_name } : {}),
    ...(target.campaign_budget_resource_name !== undefined ? { campaignBudgetResourceName: target.campaign_budget_resource_name } : {}),
    ...(target.campaign_status !== undefined ? { campaignStatus: target.campaign_status } : {}),
    ...(target.updated_at !== undefined ? { updatedAt: toIsoTimestamp(target.updated_at) } : {}),
    ...(target.ad_group_resource_names !== undefined ? { adGroupResourceNames: target.ad_group_resource_names } : {}),
    ...(target.ad_resource_names !== undefined ? { adResourceNames: target.ad_resource_names } : {}),
    ...(target.meta_ad_set_resource_names !== undefined ? { metaAdSetResourceNames: target.meta_ad_set_resource_names } : {}),
    ...(target.meta_ad_resource_names !== undefined ? { metaAdResourceNames: target.meta_ad_resource_names } : {}),
  };
}

/** One of a project's approved `credential` connections (KAN-27), for the seed-target form's KAN-74 connection picker. */
export interface AutomationConnectionOption {
  id: string;
  label: string;
  tier: ConnectionWriteTier;
  /** The connected credential's platform (`google_ads`/`meta_ads`/...) — the campaign pages' platform badge. Absent when the attachment's credential row is gone. */
  provider?: CredentialProvider;
}

/** Labels each approved credential attachment with its credential's own name — the project may only ever see its own attachment's `write_tier`, never another project's slice of the same shared credential. */
export function toAutomationConnectionOptions(
  attachments: readonly ResourceAttachmentModel[],
  credentials: readonly SharedCredentialModel[],
): AutomationConnectionOption[] {
  const credentialById = new Map(credentials.map((credential) => [credential.id, credential]));
  return attachments
    .filter((attachment) => attachment.resource_kind === 'credential')
    .map((attachment) => {
      const credential = credentialById.get(attachment.resource_id);
      return {
        id: attachment.id,
        label: credential?.name ?? attachment.resource_id,
        tier: attachment.write_tier,
        ...(credential ? { provider: credential.provider } : {}),
      };
    });
}

/** One row of an action's before/after diff — generic over any action type's payload shape, not just today's single `dailyBudgetUsd` field (KAN-74's "every action browsable with diff" AC). */
export interface AutomationActionDiffEntry {
  key: string;
  before: unknown;
  after: unknown;
}

/** A keyword edit's `addKeywords`/`addNegativeKeywords` diff value is an array of `{text, matchType}` objects — `String(...)` on it would render `[object Object]` per entry, so it gets a compact "text (matchType)" summary instead, same reasoning `formatDiffValue`'s own `campaignDraft` branch already established for a nested object value. */
function formatKeywordListDiffValue(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value
    .map((entry) => {
      const keyword = entry as { text?: unknown; matchType?: unknown };
      return `${String(keyword.text)} (${String(keyword.matchType)})`;
    })
    .join(', ');
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
 * rather than relying on that degradation. `addKeywords`/`addNegativeKeywords`
 * are handled by {@link formatKeywordListDiffValue} before this branch is
 * ever reached — see that function's own doc comment.
 */
/** A `creative` diff value is a `MetaAdCreativeEditContent` object — `String(...)` on it would render `[object Object]`, so it gets a compact "headline (primary text)" summary instead, the same reasoning `formatDiffValue`'s own `campaignDraft` branch establishes for its own nested object value. */
function formatCreativeDiffValue(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const creative = value as { primaryText?: unknown; headline?: unknown };
  return `"${String(creative.headline)}" (${String(creative.primaryText)})`;
}

/** A `targeting` diff value is a `MetaAdSetTargetingEdit` object (countries/ageMin/ageMax/optional genders) — `String(...)` on it would render `[object Object]`, so it gets a compact "US, CA (18-45, female)" summary instead, the same reasoning `formatCreativeDiffValue` establishes one field over. */
function formatTargetingDiffValue(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const targeting = value as { countries?: unknown; ageMin?: unknown; ageMax?: unknown; genders?: unknown };
  const countries = Array.isArray(targeting.countries) ? targeting.countries.join(', ') : String(targeting.countries);
  const gendersSuffix = Array.isArray(targeting.genders) && targeting.genders.length > 0 ? `, ${targeting.genders.join('/')}` : '';
  return `${countries} (${String(targeting.ageMin)}-${String(targeting.ageMax)}${gendersSuffix})`;
}

function formatDiffValue(key: string, value: unknown): unknown {
  if (key === 'addKeywords' || key === 'addNegativeKeywords') {
    return formatKeywordListDiffValue(value);
  }
  if (key === 'creative') {
    return formatCreativeDiffValue(value);
  }
  if (key === 'targeting') {
    return formatTargetingDiffValue(value);
  }
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
  adGroupResourceName: 'diffFieldAdGroupResourceName',
  addKeywords: 'diffFieldAddKeywords',
  addNegativeKeywords: 'diffFieldAddNegativeKeywords',
  addedKeywordResourceNames: 'diffFieldAddedKeywordResourceNames',
  addedNegativeKeywordResourceNames: 'diffFieldAddedNegativeKeywordResourceNames',
  adSetResourceName: 'diffFieldAdSetResourceName',
  adSetStatus: 'diffFieldAdSetStatus',
  adResourceName: 'diffFieldAdResourceName',
  creative: 'diffFieldCreative',
  targeting: 'diffFieldTargeting',
  previousCreativeResourceName: 'diffFieldPreviousCreativeResourceName',
  newCreativeResourceName: 'diffFieldNewCreativeResourceName',
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

/**
 * The campaign's creatives, derived rather than stored: a target can only
 * ever have ONE `campaign_draft_create` action (`proposeCampaignDraftCreateAction`
 * rejects a second), and its `after.campaignDraft` is the single source of
 * truth for "what ad groups / RSAs / ad sets does this campaign carry" —
 * nothing copies the draft onto the target row itself. Prefers the executed
 * draft (the one that actually created the live campaign) over a merely
 * proposed/blocked one, so the creatives panel shows what IS live, not what
 * someone once suggested.
 */
export function findCampaignDraftForTarget(actions: readonly AutomationActionModel[], targetId: string): CampaignDraft | undefined {
  const draftActions = actions.filter((action) => action.target_id === targetId && action.action_type === 'campaign_draft_create');
  const preferred =
    draftActions.find((action) => action.status === 'executed' || action.status === 'verified') ??
    draftActions.find((action) => action.status === 'approved' || action.status === 'awaiting_approval');
  const draft = preferred?.after.campaignDraft;
  return draft ? (draft as CampaignDraft) : undefined;
}
