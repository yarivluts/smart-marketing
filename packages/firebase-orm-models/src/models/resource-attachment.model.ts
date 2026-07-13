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
 * How much write access a `credential` attachment grants an ad-platform
 * connection (KAN-74, plan `02 §3`): `read` (reports/structure/creatives —
 * the safe default every attachment starts at), `optimize` (budgets, bid
 * strategies/caps, pause/enable), `manage` (full campaign lifecycle). Only
 * `optimize`/`manage` permit a KAN-71 automation action to mutate a target
 * linked to this connection — see `automation.service.ts`'s
 * `resolveWriteTierViolation`.
 */
export const CONNECTION_WRITE_TIERS = ['read', 'optimize', 'manage'] as const;
export type ConnectionWriteTier = (typeof CONNECTION_WRITE_TIERS)[number];

export function isConnectionWriteTier(value: string): value is ConnectionWriteTier {
  return (CONNECTION_WRITE_TIERS as readonly string[]).includes(value);
}

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

  /**
   * For a `template` attachment: the template's `version` at the moment this
   * request was made, per `ResourceTemplateModel`'s "copy-with-link +
   * version pin" doc comment — the org can keep bumping the template's own
   * `version` afterward without silently changing what an already-approved
   * project is pinned to. Unused for `credential`/`person` attachments
   * (neither has a version concept).
   */
  @Field()
  public resource_version?: number;

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

  /**
   * Meaningful only for `resource_kind === 'credential'` — every attachment
   * (including `template`/`person`) still gets the safe `'read'` default at
   * request time so the field is never undefined. An org-resource-owner
   * (`resources.manage`) can raise or lower it any time after approval;
   * lowering it takes effect immediately since every automation propose/
   * approve/execute step re-resolves the connection's *current* tier rather
   * than caching it (KAN-74's "tier downgrade immediately revokes
   * capabilities" AC).
   */
  @Field({ is_required: true })
  public write_tier!: ConnectionWriteTier;

  @Field()
  public write_tier_updated_at?: string;

  @Field()
  public write_tier_updated_by_user_id?: string;
}
