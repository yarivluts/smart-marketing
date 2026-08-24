import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { CollectionActivityType } from '@growthos/shared';

/**
 * One append-only entry in a customer's collections activity ledger
 * (KAN-88, E20.x, plan `14 §Gap 13`) — a call, email, note, or payment
 * follow-up/collection a rep logged toward collecting on that customer's
 * account. Never mutated or deleted once written, the same "audit trail
 * of what actually happened" posture `AuditLogEntryModel` establishes,
 * just without the hash-chain (this is operational history, not a
 * tamper-evidence surface).
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/collection_activities',
  path_id: 'collection_activity_id',
})
export class CollectionActivityModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public customer_id!: string;

  /** `OrgPersonModel.id` of the rep who performed this activity — independent of `owner_person_id` on `CustomerOwnerModel`, so a teammate can log an activity on a customer they don't (yet) own. */
  @Field({ is_required: true })
  public person_id!: string;

  @Field({ is_required: true })
  public activity_type!: CollectionActivityType;

  @Field()
  public note?: string;

  @Field({ is_required: true })
  public occurred_at!: string;

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;
}
