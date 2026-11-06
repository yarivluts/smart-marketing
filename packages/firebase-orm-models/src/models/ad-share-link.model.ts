import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * A read-only link an agency sends its client (the site owner) to look at a project's Ad Studio
 * ads without signing in. Top-level collection, like `TvPairingModel`: the public page knows only
 * the token, never the org or project, so it must be able to find the record from the token alone.
 *
 * The document id is the SHA-256 hex digest of the token; the token itself is never stored and is
 * shown once, when the link is made. Revocation is a field, not a delete, so the admin list keeps
 * a record of every link that was handed out.
 */
@Model({
  reference_path: 'ad_share_links',
  path_id: 'ad_share_link_id',
})
export class AdShareLinkModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** The ads (briefs) the link shows; null shows every ad of the project that has a finished creative. */
  @Field({ is_required: false })
  public brief_ids?: string[] | null;

  /** Who the link was made for, as the person typed it ("Dana at Acme"); may be empty. */
  @Field({ is_required: true })
  public label!: string;

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_on!: string;

  @Field({ is_required: true })
  public expires_on!: string;

  @Field({ is_required: false })
  public revoked_on?: string | null;

  @Field({ is_required: false })
  public revoked_by?: string | null;
}
