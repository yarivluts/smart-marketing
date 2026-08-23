import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * `active`: this channel's average signup quality score has degraded past
 * `QUALITY_MIX_SHIFT_FIRE_THRESHOLD_POINTS` (`@growthos/shared`) and hasn't
 * recovered since. `resolved`: it recovered past
 * `QUALITY_MIX_SHIFT_RESOLVE_THRESHOLD_POINTS`. Same two-state episode
 * vocabulary `TrackingAlertModel` (KAN-36) established.
 */
export const QUALITY_MIX_ALERT_STATUSES = ['active', 'resolved'] as const;
export type QualityMixAlertStatus = (typeof QUALITY_MIX_ALERT_STATUSES)[number];

/**
 * How a check that touched this alert was invoked — mirrors
 * `TrackingAlertTrigger` (KAN-36): `manual` is the only value today (a
 * "check now" stand-in for a real scheduled check, deferred until KAN-18),
 * kept as an explicit enum so a future `scheduled` trigger kind is a pure
 * additive change to this list, not a shape change.
 */
export const QUALITY_MIX_ALERT_TRIGGERS = ['manual'] as const;
export type QualityMixAlertTrigger = (typeof QUALITY_MIX_ALERT_TRIGGERS)[number];

/**
 * One "signup quality mix shifted" episode for one marketing channel in one
 * project (KAN-83, plan `14 §Gap 4`: "alert when a channel's intent mix
 * degrades even if CPS looks fine — classic Meta failure mode"). One
 * document per episode: created the first time a check finds a channel's
 * current-window average quality score has dropped past the fire threshold
 * relative to its own prior baseline window (`status: 'active'`), updated in
 * place on every later check while it stays degraded (`last_checked_at`),
 * and flipped to `status: 'resolved'` the first time a check finds it's
 * recovered — the same "one document, updated across its own lifecycle"
 * posture `TrackingAlertModel` already established, rather than a fresh
 * document per check.
 *
 * Scoped project-wide (not per-environment like `TrackingAlertModel`): a
 * channel's signup-quality mix is a marketing-attribution concept, not a
 * per-environment traffic-volume one — a `dev` key produces no real
 * signups/attribution to begin with, so there's no meaningful "dev vs prod"
 * split to preserve here the way there is for raw event silence.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/quality_mix_alerts',
  path_id: 'quality_mix_alert_id',
})
export class QualityMixAlertModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** The `fact_signup_quality_score.channel_id` value this episode is about (including the literal `unattributed` value — a real, alertable channel bucket). */
  @Field({ is_required: true })
  public channel_id!: string;

  @Field({ is_required: true })
  public status!: QualityMixAlertStatus;

  @Field({ is_required: true })
  public trigger!: QualityMixAlertTrigger;

  /** When this episode first fired — set once, never updated while `status` stays `active`. */
  @Field({ is_required: true })
  public detected_at!: string;

  /** This channel's average quality score over the baseline window, as observed at detection time. */
  @Field({ is_required: true })
  public baseline_avg_score!: number;

  /** This channel's average quality score over the current window, as observed at detection time. */
  @Field({ is_required: true })
  public current_avg_score!: number;

  /** `baseline_avg_score - current_avg_score`, as observed at detection time — positive means quality degraded. */
  @Field({ is_required: true })
  public delta!: number;

  /** Updated on every check that still finds this episode `active`, so an admin can tell a fresh check ran from a stale one. */
  @Field({ is_required: true })
  public last_checked_at!: string;

  /** Present only once `status` flips to `resolved`. */
  @Field({ is_required: false })
  public resolved_at?: string;
}
