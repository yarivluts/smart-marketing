import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * A per-campaign spend budget target (KAN-86, E18.x, plan `14 §Gap 12`'s
 * "per-entity targets... attachable to campaigns/channels... inline-editable,
 * driving red/green in campaign tables"). `campaign_id` is the same bare
 * string the SaaS metric pack's `ad_spend` metric already carries as a
 * dimension (`ad_spend`'s own `campaign_id` — no `dim_campaign` surrogate
 * key exists yet, see `fact_attribution.sql`'s doc comment for the identical,
 * already-documented reason) — this model does not, and cannot yet,
 * reference a real campaign entity.
 *
 * Firestore document id is a sha256 hex digest of `campaign_id`
 * (`campaign-target.service.ts`'s `campaignTargetDocId`), not `campaign_id`
 * itself: a campaign id from ad-spend data is an arbitrary third-party
 * string (e.g. a raw `utm_campaign` value) that may contain characters
 * Firestore document ids reject (`/`) or treat specially (`.`, leading
 * `__`), the same reason `ingest.service.ts`'s dedup keys are content-hashed
 * rather than using the caller-supplied id verbatim.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/campaign_targets',
  path_id: 'campaign_target_id',
})
export class CampaignTargetModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** The raw `ad_spend`-dimension campaign id this target applies to — never itself the document id, see the class doc comment. */
  @Field({ is_required: true })
  public campaign_id!: string;

  /** A trailing-30-day spend ceiling. Red in the admin table when actual trailing-30-day spend exceeds this. */
  @Field({ is_required: true })
  public monthly_budget!: number;

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;

  @Field({ is_required: true })
  public updated_by!: string;

  @Field({ is_required: true })
  public updated_at!: string;
}
