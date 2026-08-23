import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * `running`: the executor is (or was, if the process died mid-flight) still working.
 * `succeeded`: the executor's `push()` returned successfully.
 * `failed`: the executor threw — `error_message` carries the reason.
 * Mirrors `PLUGIN_SOURCE_RUN_STATUSES`'s exact vocabulary for the outbound direction.
 */
export const PLUGIN_SINK_RUN_STATUSES = ['running', 'succeeded', 'failed'] as const;
export type PluginSinkRunStatus = (typeof PLUGIN_SINK_RUN_STATUSES)[number];

/**
 * One execution of one action-type plugin install's push (KAN-81, plan `14
 * §Gap 5`: "export/sync to CRM ... action plugin"). Firestore run-record
 * history, the outbound mirror of `PluginSourceRunModel` — scoped to the
 * plugin install it belongs to (a project may have several action-type
 * installs) *and* to the segment it synced (a "CRM Sync" install may be
 * triggered from several different saved segments over its lifetime, each
 * run recording which one).
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/plugin_sink_runs',
  path_id: 'plugin_sink_run_id',
})
export class PluginSinkRunModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public plugin_install_id!: string;

  @Field({ is_required: true })
  public segment_id!: string;

  @Field({ is_required: true })
  public status!: PluginSinkRunStatus;

  /** The human who triggered this run. Always present today (this run's only trigger is a human "Sync now" click) — kept optional, not defaulted, so a future non-human trigger (a scheduled sync, per plan `13 §E7.2`'s posture for the source side) is a pure additive change, not a shape change. */
  @Field({ is_required: false })
  public triggered_by_user_id?: string;

  @Field({ is_required: true })
  public started_at!: string;

  /** Absent while `status === 'running'`. */
  @Field({ is_required: false })
  public finished_at?: string;

  /** How many `push()` attempts the retry/backoff loop actually made — absent while `status === 'running'` and before the push itself has been attempted at all (e.g. the member list couldn't be resolved). Mirrors `PluginSourceRunModel.attempts`. */
  @Field({ is_required: false })
  public attempts?: number;

  /** How many of the segment's matching rows this run attempted to push (before the executor ran) — may exceed `records_pushed` if the push itself failed partway or outright. */
  @Field({ is_required: true })
  public records_attempted!: number;

  /** Present only once the executor itself has returned successfully. */
  @Field({ is_required: false })
  public records_pushed?: number;

  /** Present only when `status === 'failed'`. */
  @Field({ is_required: false })
  public error_message?: string;
}
