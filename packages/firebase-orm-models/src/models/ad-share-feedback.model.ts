import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type {
  AdShareFeedbackStatus,
  AdShareProposalChanges,
  AdShareProposalKind,
  AdShareProposalStatus,
  AdShareTargetKind,
  AdShareVerdict,
} from '@growthos/shared';

/**
 * Client feedback, per-ad verdicts, and general requests submitted through a share link or logged
 * manually by an account manager.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_share_feedback',
  path_id: 'ad_share_feedback_id',
})
export class AdShareFeedbackModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** Hash id of the share link, or `'manual'` when logged directly by the marketing manager. */
  @Field({ is_required: true })
  public share_link_id!: string;

  @Field({ is_required: true })
  public client_label!: string;

  @Field({ is_required: true })
  public author_name!: string;

  @Field({ is_required: true })
  public target_kind!: AdShareTargetKind;

  @Field({ is_required: false })
  public brief_id?: string | null;

  @Field({ is_required: false })
  public brief_name?: string | null;

  @Field({ is_required: false })
  public creative_ref?: string | null;

  @Field({ is_required: false })
  public campaign_id?: string | null;

  @Field({ is_required: false })
  public campaign_label?: string | null;

  @Field({ is_required: true })
  public verdict!: AdShareVerdict;

  @Field({ is_required: true })
  public comment!: string;

  @Field({ is_required: true })
  public status!: AdShareFeedbackStatus;

  @Field({ is_required: true })
  public created_on!: string;

  @Field({ is_required: false })
  public resolved_on?: string | null;
}

/**
 * AI-generated concrete change proposal synthesized from client feedback/requests, awaiting manager
 * approval or decline before mutating brief settings / scripts / creatives and regenerating.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_share_proposals',
  path_id: 'ad_share_proposal_id',
})
export class AdShareProposalModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public feedback_ids!: string[];

  @Field({ is_required: true })
  public client_quote!: string;

  @Field({ is_required: true })
  public kind!: AdShareProposalKind;

  @Field({ is_required: false })
  public brief_id?: string | null;

  @Field({ is_required: false })
  public brief_name?: string | null;

  @Field({ is_required: true })
  public title!: string;

  @Field({ is_required: true })
  public summary!: string;

  @Field({ is_required: true })
  public rationale!: string;

  @Field({ is_required: true })
  public changes!: AdShareProposalChanges;

  @Field({ is_required: true })
  public status!: AdShareProposalStatus;

  @Field({ is_required: false })
  public applied_brief_id?: string | null;

  @Field({ is_required: false })
  public run_id?: string | null;

  @Field({ is_required: false })
  public failure_reason?: string | null;

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_on!: string;

  @Field({ is_required: false })
  public decided_by?: string | null;

  @Field({ is_required: false })
  public decided_on?: string | null;
}
