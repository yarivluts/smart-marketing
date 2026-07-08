import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SchemaDefKind } from './schema-def.model';

/**
 * `running`: the executor is (or was, if the process died mid-flight) still working.
 * `succeeded`: the executor finished at least one attempt and its output (if any) was handed to
 * `ingestBatch` — this says nothing about whether every produced record was *accepted* downstream
 * (`records_quarantined`/`records_duplicate` may still be non-zero; the ingest pipeline's own
 * validation is a separate concern from whether the sync itself worked).
 * `failed`: every retry/backoff attempt threw — `error_message` carries the last attempt's reason.
 */
export const PLUGIN_SOURCE_RUN_STATUSES = ['running', 'succeeded', 'failed'] as const;
export type PluginSourceRunStatus = (typeof PLUGIN_SOURCE_RUN_STATUSES)[number];

/**
 * How a run was started. `manual` is the only value today — the same
 * buildable-today "run once" stand-in `OrchestrationRunModel` (KAN-38)
 * already established, kept as an explicit enum value (not an implicit
 * default) so a future `scheduled` trigger (Cloud Run jobs, per plan `13
 * §E7.2`) is a pure additive change to this list, not a shape change.
 */
export const PLUGIN_SOURCE_RUN_TRIGGERS = ['manual'] as const;
export type PluginSourceRunTrigger = (typeof PLUGIN_SOURCE_RUN_TRIGGERS)[number];

/**
 * One execution of one source-plugin install's sync (KAN-47, plan `13
 * §E7.2`: "scheduled execution ..., cursor persistence, retry/backoff").
 * Firestore run-record history, the same "one document per run" posture
 * `OrchestrationRunModel` already established, scoped to the plugin install
 * it belongs to (not just the project) since a project may have several
 * source-plugin installs, each syncing independently on its own cursor.
 *
 * `cursor_before`/`cursor_after` are this run's own before/after snapshot of
 * the persisted cursor (`PluginInstallModel.source_cursor`) — kept on the
 * run record too (not just the install) so a run's own incremental progress
 * is inspectable after the fact even once a later run has moved the
 * install's cursor further forward.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/plugin_source_runs',
  path_id: 'plugin_source_run_id',
})
export class PluginSourceRunModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public plugin_install_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  @Field({ is_required: true })
  public status!: PluginSourceRunStatus;

  @Field({ is_required: true })
  public trigger!: PluginSourceRunTrigger;

  /** The human who triggered this run, when there was one — absent for a future scheduled/system-triggered run. */
  @Field({ is_required: false })
  public triggered_by_user_id?: string;

  @Field({ is_required: true })
  public started_at!: string;

  /** Absent while `status === 'running'`. */
  @Field({ is_required: false })
  public finished_at?: string;

  /** How many `sync()` attempts the retry/backoff loop actually made — 1 means it succeeded (or exhausted) on the first try. */
  @Field({ is_required: true })
  public attempts!: number;

  /** `null` means "from scratch" — this install has never completed a sync before. */
  /**
   * `is_required: false` even though this is always set before the run's
   * first save: `@arbel/firebase-orm`'s own required-field check treats
   * `null` the same as "missing" (it exists to catch an accidentally-unset
   * field, not to allow a legitimately-nullable one), and `null` is exactly
   * this field's own honest "from scratch" value — marking it required would
   * make every "from scratch" run log a spurious "can't save" warning.
   */
  @Field({ is_required: false })
  public cursor_before!: string | null;

  /** Present only once the executor itself has returned successfully (regardless of the run's own final `status`, which also depends on whether landing the records into the pipeline succeeded). */
  @Field({ is_required: false })
  public cursor_after?: string | null;

  @Field({ is_required: false })
  public record_kind?: SchemaDefKind;

  @Field({ is_required: false })
  public records_fetched?: number;

  @Field({ is_required: false })
  public records_accepted?: number;

  @Field({ is_required: false })
  public records_quarantined?: number;

  @Field({ is_required: false })
  public records_duplicate?: number;

  /** Present only when `status === 'failed'`. */
  @Field({ is_required: false })
  public error_message?: string;
}
