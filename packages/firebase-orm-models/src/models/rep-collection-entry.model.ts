import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { RepCollectionType } from '@growthos/shared';

/**
 * One row on a project's rep-attributed collections ledger (KAN-88, E20.x,
 * plan `14 §Gap 13`, "Get them Moneys"): revenue collected (an upgrade, a
 * save, an expansion, ...) attributed to the org person (`OrgPersonModel`,
 * the "dim_team_member" people layer KAN-27/KAN-81 already built) who drove
 * it. Not a commission system — an attribution view, so there is no payout
 * math anywhere near this model, just a ledger a human can browse/export and
 * aggregate into a leaderboard.
 *
 * `company` is a free-text string, not a reference to a real customer/company
 * entity — the same "no `dim_company` surrogate key exists yet" limitation
 * `CampaignTargetModel`'s own doc comment documents for `campaign_id`.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/rep_collection_entries',
  path_id: 'rep_collection_entry_id',
})
export class RepCollectionEntryModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /**
   * References `OrgPersonModel.id`; `null` when not yet attributed to a rep
   * (e.g. a billing signal added to the ledger before anyone picked who
   * drove it). Same explicit-`null`, `is_required: false` convention
   * `SegmentModel.owner_person_id` documents.
   */
  @Field({ is_required: false })
  public org_person_id!: string | null;

  @Field({ is_required: true, is_text_indexing: true })
  public company!: string;

  /** The "how" — upgrade/expansion/save/renewal/other. See `RepCollectionType` (`@growthos/shared`). */
  @Field({ is_required: true })
  public collection_type!: RepCollectionType;

  @Field()
  public plan_from?: string;

  @Field()
  public plan_to?: string;

  @Field({ is_required: true })
  public amount!: number;

  /** When the collection happened (ISO date/datetime) — the ledger's own "When", and what the weekly/monthly leaderboard windows filter on. Distinct from `created_at` (when the entry was logged, which may be later). */
  @Field({ is_required: true })
  public occurred_at!: string;

  @Field()
  public note?: string;

  /**
   * The `RawRecordModel.id` this entry was created from, if it started as an
   * auto-suggested billing signal (a landed `stripe_charge`) rather than a
   * fully manual entry — lets `listBillingCollectionSignalsForProject`
   * exclude a charge that's already been attributed, so the same signal
   * never gets suggested twice. `undefined` for a purely manual entry.
   */
  @Field()
  public source_raw_record_id?: string;

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;

  @Field({ is_required: true })
  public updated_by!: string;

  @Field({ is_required: true })
  public updated_at!: string;
}
