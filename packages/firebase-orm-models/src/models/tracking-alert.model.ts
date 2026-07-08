import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * `active`: the event has been silent for at least the configured threshold
 * and hasn't recovered since. `resolved`: the event started landing records
 * again after having been `active`.
 */
export const TRACKING_ALERT_STATUSES = ['active', 'resolved'] as const;
export type TrackingAlertStatus = (typeof TRACKING_ALERT_STATUSES)[number];

/**
 * How a check that touched this alert was invoked. `manual` is the only
 * value today (KAN-36's buildable-today "check now" stand-in, mirroring
 * KAN-38's `OrchestrationRunTrigger` — see `tracking-alert.service.ts`'s own
 * doc comment for why a real scheduled check is deferred to KAN-18); kept as
 * an explicit enum so a future `scheduled` trigger kind is a pure additive
 * change to this list, not a shape change.
 */
export const TRACKING_ALERT_TRIGGERS = ['manual'] as const;
export type TrackingAlertTrigger = (typeof TRACKING_ALERT_TRIGGERS)[number];

/**
 * One "tracking broke" episode for a registered event schema (KAN-36: plan
 * `13 §E3.6` / `14` gap 7 — "dropping an event type to zero fires an alert
 * within an hour"). One document per episode: created the first time a
 * check finds the event silent past the threshold (`status: 'active'`),
 * updated in place on every later check while it stays silent
 * (`last_checked_at`), and flipped to `status: 'resolved'` the first time a
 * check finds the event flowing again — the same "one document, updated
 * across its own lifecycle" posture `OrchestrationRunModel` (KAN-38) already
 * established, rather than a fresh document per check.
 *
 * Scoped to a project (not per-environment), matching every other
 * project-level admin rollup in this codebase (`IngestBatchModel`,
 * `QuarantinedRecordModel`, `OrchestrationRunModel`) — they all fold every
 * environment into one admin view rather than splitting by one.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/tracking_alerts',
  path_id: 'tracking_alert_id',
})
export class TrackingAlertModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** The event schema's `name` (`SchemaDefModel.name`, kind `event`) this alert is about. */
  @Field({ is_required: true })
  public schema_name!: string;

  @Field({ is_required: true })
  public status!: TrackingAlertStatus;

  @Field({ is_required: true })
  public trigger!: TrackingAlertTrigger;

  /** When this episode first fired — set once, never updated while `status` stays `active`. */
  @Field({ is_required: true })
  public detected_at!: string;

  /** The event's own last-landed-record timestamp as observed at detection time. */
  @Field({ is_required: true })
  public last_seen_at!: string;

  /** Updated on every check that still finds this episode `active`, so an admin can tell a fresh check ran from a stale one. */
  @Field({ is_required: true })
  public last_checked_at!: string;

  /** Present only once `status` flips to `resolved`. */
  @Field({ is_required: false })
  public resolved_at?: string;
}
