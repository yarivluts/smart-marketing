import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * `active`: this industry's share of newly-landed firmographic profiles has
 * shifted past `COMPOSITION_SHIFT_FIRE_THRESHOLD_SHARE_POINTS`
 * (`@growthos/shared`) and hasn't recovered since. `resolved`: it recovered
 * past `COMPOSITION_SHIFT_RESOLVE_THRESHOLD_SHARE_POINTS`. Same two-state
 * episode vocabulary `TrackingAlertModel` (KAN-36)/`QualityMixAlertModel`
 * (KAN-83) already established.
 */
export const FIRMOGRAPHIC_COMPOSITION_ALERT_STATUSES = ['active', 'resolved'] as const;
export type FirmographicCompositionAlertStatus = (typeof FIRMOGRAPHIC_COMPOSITION_ALERT_STATUSES)[number];

/**
 * How a check that touched this alert was invoked — mirrors
 * `TrackingAlertTrigger`/`QualityMixAlertTrigger`: `manual` is the only
 * value today (a "check now" stand-in for a real scheduled check, deferred
 * until KAN-18), kept as an explicit enum so a future `scheduled` trigger
 * kind is a pure additive change to this list, not a shape change.
 */
export const FIRMOGRAPHIC_COMPOSITION_ALERT_TRIGGERS = ['manual'] as const;
export type FirmographicCompositionAlertTrigger = (typeof FIRMOGRAPHIC_COMPOSITION_ALERT_TRIGGERS)[number];

/**
 * One "customer-base composition shifted" episode for one industry in one
 * project (KAN-87, plan `14 §Gap 11`: "composition-shift alerts"). One
 * document per episode: created the first time a check finds an industry's
 * current-window share of new firmographic profiles has moved past the
 * fire threshold relative to its own prior baseline window (`status:
 * 'active'`), updated in place on every later check while it stays shifted
 * (`last_checked_at`), and flipped to `status: 'resolved'` the first time a
 * check finds it's settled back down — the same "one document, updated
 * across its own lifecycle" posture `TrackingAlertModel`/
 * `QualityMixAlertModel` already established, rather than a fresh document
 * per check.
 *
 * Scoped project-wide (not per-environment like `TrackingAlertModel`): a
 * project's customer-base composition is a business-wide concept, not a
 * per-environment traffic-volume one — same reasoning `QualityMixAlertModel`'s
 * own doc comment gives for its own project-wide scoping.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/firmographic_composition_alerts',
  path_id: 'firmographic_composition_alert_id',
})
export class FirmographicCompositionAlertModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** The `fact_company_firmographic.industry` value this episode is about (including the literal `other` bucket — a real, alertable category). */
  @Field({ is_required: true })
  public industry!: string;

  @Field({ is_required: true })
  public status!: FirmographicCompositionAlertStatus;

  @Field({ is_required: true })
  public trigger!: FirmographicCompositionAlertTrigger;

  /** When this episode first fired — set once, never updated while `status` stays `active`. */
  @Field({ is_required: true })
  public detected_at!: string;

  /** This industry's share (0-1) of the baseline window's total profile count, as observed at detection time. */
  @Field({ is_required: true })
  public baseline_share!: number;

  /** This industry's share (0-1) of the current window's total profile count, as observed at detection time. */
  @Field({ is_required: true })
  public current_share!: number;

  /** `abs(baseline_share - current_share)`, as observed at detection time. */
  @Field({ is_required: true })
  public delta!: number;

  /** Updated on every check that still finds this episode `active`, so an admin can tell a fresh check ran from a stale one. */
  @Field({ is_required: true })
  public last_checked_at!: string;

  /** Present only once `status` flips to `resolved`. */
  @Field({ is_required: false })
  public resolved_at?: string;
}
