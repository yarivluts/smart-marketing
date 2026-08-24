import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * A per-customer rep assignment (KAN-88, E20.x, plan `14 §Gap 13`'s
 * "rep-attributed collections" — a customer's collected revenue only
 * attributes to a rep once someone assigns that rep to that customer).
 * `customer_id` is the same opaque warehouse customer id `fact_revenue_
 * event.customer_id` already carries (a Stripe `cus_...` id in practice,
 * via the SaaS pack's own `collected_revenue` metric) — this model does
 * not, and cannot yet, reference a real customer entity.
 *
 * Firestore document id is a sha256 hex digest of `customer_id`
 * (`rep-collections.service.ts`'s `customerOwnerDocId`), not `customer_id`
 * itself — the same "arbitrary third-party string may contain characters
 * Firestore ids reject" reasoning `CampaignTargetModel`'s own doc comment
 * gives for `campaignTargetDocId`.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/customer_owners',
  path_id: 'customer_owner_id',
})
export class CustomerOwnerModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** The raw `collected_revenue`-dimension customer id this assignment applies to — never itself the document id, see the class doc comment. */
  @Field({ is_required: true })
  public customer_id!: string;

  /** `OrgPersonModel.id` of the rep attributed collections on this customer are credited to. */
  @Field({ is_required: true })
  public owner_person_id!: string;

  @Field({ is_required: true })
  public assigned_by!: string;

  @Field({ is_required: true })
  public assigned_at!: string;
}
