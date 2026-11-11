import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { GrowthSuggestionThresholds } from '@growthos/shared';

/** One change to the platform-wide defaults: who, when, and the values before and after. */
export interface GrowthPilotSettingsChange {
  by: string;
  on: string;
  before: Partial<GrowthSuggestionThresholds> | null;
  after: Partial<GrowthSuggestionThresholds> | null;
}

/**
 * The Growth Pilot suggestion thresholds every project starts from, set by GrowthOS operators. One
 * top-level document, id `defaults`. It keeps its own short change history, since the audit log is
 * kept per organization and this belongs to none.
 */
@Model({
  reference_path: 'growth_pilot_platform_settings',
  path_id: 'growth_pilot_platform_settings_id',
})
export class GrowthPilotPlatformSettingsModel extends BaseModel {
  /** Only the thresholds the operators set; the rest come from the built-in defaults. */
  @Field({ is_required: true })
  public suggestion_thresholds!: Partial<GrowthSuggestionThresholds>;

  @Field({ is_required: true })
  public changed_by!: string;

  @Field({ is_required: true })
  public last_changed_on!: string;

  /** The newest changes, newest last (at most {@link GROWTH_PILOT_SETTINGS_HISTORY}). */
  @Field({ is_required: true })
  public history!: GrowthPilotSettingsChange[];
}

/** How many changes the platform defaults remember. */
export const GROWTH_PILOT_SETTINGS_HISTORY = 20;

/**
 * A project's own Growth Pilot suggestion thresholds, over the platform defaults. One document per
 * project, id `settings`; only the thresholds the project overrides are stored. Changes are audited.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/growth_pilot_settings',
  path_id: 'growth_pilot_settings_id',
})
export class GrowthPilotProjectSettingsModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public suggestion_thresholds!: Partial<GrowthSuggestionThresholds>;

  @Field({ is_required: true })
  public changed_by!: string;

  @Field({ is_required: true })
  public last_changed_on!: string;
}
