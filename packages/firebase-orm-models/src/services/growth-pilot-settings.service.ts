import {
  DEFAULT_GROWTH_SUGGESTION_THRESHOLDS,
  GROWTH_SUGGESTION_THRESHOLD_KEYS,
  isValidGrowthSuggestionThreshold,
  resolveGrowthSuggestionThresholds,
  validateGrowthSuggestionThresholds,
  type GrowthSuggestionThresholds,
} from '@growthos/shared';
import { GROWTH_PILOT_SETTINGS_HISTORY, GrowthPilotPlatformSettingsModel, GrowthPilotProjectSettingsModel, type GrowthPilotSettingsChange } from '../models/growth-pilot-settings.model';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';

/**
 * The Growth Pilot suggestion thresholds: built-in defaults, the platform's defaults over them (set
 * by GrowthOS operators), and a project's own values over those (set by the project's admins). The
 * page's suggestion rules read the effective result; the admin pages read and change each layer.
 */

export class GrowthSuggestionThresholdsInvalidError extends Error {
  constructor(public readonly invalid: string[]) {
    super(`Invalid Growth Pilot thresholds: ${invalid.join(', ')}.`);
    this.name = 'GrowthSuggestionThresholdsInvalidError';
  }
}

const PLATFORM_ID = 'defaults';
const PROJECT_ID = 'settings';

/** Only the known, valid keys of a stored layer, in the stable key order (a stored doc may hold old keys). */
function clean(stored: Partial<Record<string, unknown>> | null | undefined): Partial<GrowthSuggestionThresholds> {
  const out: Partial<GrowthSuggestionThresholds> = {};
  for (const key of GROWTH_SUGGESTION_THRESHOLD_KEYS) {
    const value = stored?.[key];
    if (isValidGrowthSuggestionThreshold(key, value)) out[key] = value;
  }
  return out;
}

export interface GrowthPlatformThresholdsView {
  /** What every project starts from: the built-in defaults with the operators' values over them. */
  effective: GrowthSuggestionThresholds;
  /** Only what the operators set. */
  overrides: Partial<GrowthSuggestionThresholds>;
  builtIn: GrowthSuggestionThresholds;
  lastChangedOn: string | null;
  changedBy: string | null;
  history: GrowthPilotSettingsChange[];
}

export async function getGrowthPlatformThresholds(): Promise<GrowthPlatformThresholdsView> {
  const row = await GrowthPilotPlatformSettingsModel.init(PLATFORM_ID);
  const overrides = clean(row?.suggestion_thresholds);
  return {
    effective: resolveGrowthSuggestionThresholds(overrides),
    overrides,
    builtIn: { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS },
    lastChangedOn: row?.last_changed_on ?? null,
    changedBy: row?.changed_by ?? null,
    history: row?.history ?? [],
  };
}

/**
 * Sets the platform defaults (a full or partial set; `null` resets to the built-in values). Every
 * value is checked first - nothing is saved when any is out of range. The change is remembered on
 * the document with who made it.
 */
export async function setGrowthPlatformThresholds(params: { thresholds: unknown | null; actorId: string; now?: Date }): Promise<GrowthPlatformThresholdsView> {
  let next: Partial<GrowthSuggestionThresholds> = {};
  if (params.thresholds !== null) {
    const valid = validateGrowthSuggestionThresholds(params.thresholds, { partial: true });
    if (!valid.ok) throw new GrowthSuggestionThresholdsInvalidError(valid.invalid);
    next = valid.value;
  }
  const now = (params.now ?? new Date()).toISOString();
  const existing = await GrowthPilotPlatformSettingsModel.init(PLATFORM_ID);
  const before = existing ? clean(existing.suggestion_thresholds) : null;
  const row = existing ?? new GrowthPilotPlatformSettingsModel();
  row.suggestion_thresholds = next;
  row.changed_by = params.actorId;
  row.last_changed_on = now;
  row.history = [...(existing?.history ?? []), { by: params.actorId, on: now, before, after: next }].slice(-GROWTH_PILOT_SETTINGS_HISTORY);
  await (existing ? row.save() : row.save(PLATFORM_ID));
  return getGrowthPlatformThresholds();
}

export interface GrowthProjectThresholdsView {
  /** What the project's suggestions use. */
  effective: GrowthSuggestionThresholds;
  /** Only what the project set over the platform. */
  overrides: Partial<GrowthSuggestionThresholds>;
  /** What applies where the project sets nothing. */
  platform: GrowthSuggestionThresholds;
  lastChangedOn: string | null;
}

async function requireProject(organizationId: string, projectId: string): Promise<void> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) throw new ProjectNotFoundError();
}

async function projectRow(organizationId: string, projectId: string): Promise<GrowthPilotProjectSettingsModel | null> {
  return GrowthPilotProjectSettingsModel.init(PROJECT_ID, { organization_id: organizationId, project_id: projectId });
}

export async function getGrowthProjectThresholds(organizationId: string, projectId: string): Promise<GrowthProjectThresholdsView> {
  const [platform, row] = await Promise.all([getGrowthPlatformThresholds(), projectRow(organizationId, projectId)]);
  const overrides = clean(row?.suggestion_thresholds);
  return {
    effective: resolveGrowthSuggestionThresholds(platform.overrides, overrides),
    overrides,
    platform: platform.effective,
    lastChangedOn: row?.last_changed_on ?? null,
  };
}

/** The thresholds a project's suggestions use. */
export async function getEffectiveGrowthThresholds(organizationId: string, projectId: string): Promise<GrowthSuggestionThresholds> {
  return (await getGrowthProjectThresholds(organizationId, projectId)).effective;
}

/**
 * Sets the project's own thresholds (only those given override the platform; `null` resets the
 * project to the platform defaults). Checked before anything is saved; audited with before and after.
 */
export async function setGrowthProjectThresholds(params: { organizationId: string; projectId: string; thresholds: unknown | null; actorId: string; now?: Date }): Promise<GrowthProjectThresholdsView> {
  let next: Partial<GrowthSuggestionThresholds> = {};
  if (params.thresholds !== null) {
    const valid = validateGrowthSuggestionThresholds(params.thresholds, { partial: true });
    if (!valid.ok) throw new GrowthSuggestionThresholdsInvalidError(valid.invalid);
    next = valid.value;
  }
  await requireProject(params.organizationId, params.projectId);
  const before = await getGrowthProjectThresholds(params.organizationId, params.projectId);
  const existing = await projectRow(params.organizationId, params.projectId);
  if (params.thresholds === null || Object.keys(next).length === 0) {
    if (existing) await existing.remove();
  } else {
    const row = existing ?? new GrowthPilotProjectSettingsModel();
    row.organization_id = params.organizationId;
    row.project_id = params.projectId;
    row.suggestion_thresholds = next;
    row.changed_by = params.actorId;
    row.last_changed_on = (params.now ?? new Date()).toISOString();
    row.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
    await (existing ? row.save() : row.save(PROJECT_ID));
  }
  const after = await getGrowthProjectThresholds(params.organizationId, params.projectId);
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorId,
      action: Object.keys(after.overrides).length ? 'growth_pilot.thresholds_changed' : 'growth_pilot.thresholds_reset',
      targetType: 'growth_pilot_settings',
      targetId: params.projectId,
      summary: Object.keys(after.overrides).length ? 'Changed the Growth Pilot suggestion thresholds' : 'Reset the Growth Pilot suggestion thresholds to the platform defaults',
      before: { ...before.overrides },
      after: { ...after.overrides },
    });
  } catch {
    // Best-effort: the change itself is saved either way.
  }
  return after;
}
