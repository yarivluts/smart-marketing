import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * One fired win (KAN-65, E12.2, plan `04 §6`'s "real-time win feed"): a
 * landed event that matched an active {@link WinRuleModel} at ingest time.
 * Created by `win-rule.service.ts`'s `evaluateRecordAgainstWinRules`, called
 * synchronously right after `landPipelineMessages` on the ingest path — the
 * "ingest -> Pub/Sub -> WebSocket" AC's first two hops share the exact same
 * Firestore-outbox/raw-table stand-ins `PipelineMessageModel`/`RawRecordModel`
 * (KAN-33) already established, so this model only needs to capture *that a
 * win happened*, not re-invent delivery.
 *
 * The document id is deterministic — `winEventId(rawRecordId, winRuleId)` in
 * `win-rule.service.ts` — so re-evaluating the same landed record against
 * the same rule (a retried ingest, a future replay) is an idempotent no-op
 * rather than a duplicate feed entry, the same pattern `RawRecordModel`'s own
 * doc comment documents for re-landing a message.
 *
 * `win_rule_name`/`schema_name` are denormalized onto the event itself so the
 * feed still reads correctly even if the rule is later renamed or deleted —
 * a win is a historical fact, not a live join.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/win_events',
  path_id: 'win_event_id',
})
export class WinEventModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  @Field({ is_required: true })
  public win_rule_id!: string;

  @Field({ is_required: true })
  public win_rule_name!: string;

  @Field({ is_required: true })
  public schema_name!: string;

  /** The `RawRecordModel.id` this win was detected from. */
  @Field({ is_required: true })
  public raw_record_id!: string;

  @Field({ is_required: true })
  public client_id!: string;

  /** A snapshot of the matched record's payload, for feed display without a further lookup. */
  @Field({ is_required: true })
  public payload!: Record<string, unknown>;

  /** The matched record's own `landed_at`. */
  @Field({ is_required: true })
  public occurred_at!: string;

  /** When this win event itself was created — the field the live-feed poll cursors on. */
  @Field({ is_required: true })
  public created_at!: string;
}
