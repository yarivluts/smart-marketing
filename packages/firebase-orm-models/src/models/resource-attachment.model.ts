import { BaseModel, Field, Model } from '@arbel/firebase-orm';

export const RESOURCE_KINDS = ['credential', 'template', 'person'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export function isResourceKind(value: string): value is ResourceKind {
  return (RESOURCE_KINDS as readonly string[]).includes(value);
}

/**
 * `pending`: awaiting an org-resource-owner decision. `approved`: the
 * project may use the resource (and, for a credential, only the
 * `scope_selection` slice of it). `rejected`: decided against, terminal.
 * `detached`: was approved, then revoked — per plan 08 §1.2 "detaching
 * revokes immediately", so every access check must treat only `approved` as
 * active; `detached` is kept (not deleted) purely as an audit trail of past
 * access, matching "resource usage is audited per project".
 */
export const RESOURCE_ATTACHMENT_STATUSES = ['pending', 'approved', 'rejected', 'detached'] as const;
export type ResourceAttachmentStatus = (typeof RESOURCE_ATTACHMENT_STATUSES)[number];

/**
 * One project's request for (and, once decided, grant of) a slice of an org
 * resource — the join between `ProjectModel` and a library resource
 * (`SharedCredentialModel` / `ResourceTemplateModel` / `OrgPersonModel`),
 * keyed by `resource_kind` + `resource_id` rather than three separate
 * attachment models since the request/approve/detach lifecycle (plan 08
 * §1.2: "project-admin initiated + org-resource-owner approved ... an
 * attached resource exposes only the slice granted to that project;
 * detaching revokes immediately") is identical across all three kinds.
 */
@Model({
  reference_path: 'organizations/:organization_id/resource_attachments',
  path_id: 'resource_attachment_id',
})
export class ResourceAttachmentModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public resource_kind!: ResourceKind;

  @Field({ is_required: true })
  public resource_id!: string;

  @Field({ is_required: true })
  public status!: ResourceAttachmentStatus;

  /**
   * For a `credential` attachment: the subset of the credential's
   * `available_scopes` this project may see. Unused for `template`/`person`
   * attachments (those are all-or-nothing).
   */
  @Field()
  public scope_selection?: string[];

  @Field({ is_required: true })
  public requested_by!: string;

  @Field({ is_required: true })
  public requested_at!: string;

  @Field()
  public decided_by?: string;

  @Field()
  public decided_at?: string;

  @Field()
  public detached_at?: string;
}
