import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * What kind of org-standard template this is (plan 08 §1.2). The concrete
 * consumers for most of these (Schema Registry, the semantic metric layer,
 * dashboards, automation guardrails) don't exist yet — this model stores the
 * template's identity, kind, and a versioned opaque config blob today, ready
 * for those later stories to give `config` a stricter per-kind shape.
 */
export const RESOURCE_TEMPLATE_TYPES = ['metric_definition', 'schema', 'dashboard', 'guardrail_policy'] as const;
export type ResourceTemplateType = (typeof RESOURCE_TEMPLATE_TYPES)[number];

export function isResourceTemplateType(value: string): value is ResourceTemplateType {
  return (RESOURCE_TEMPLATE_TYPES as readonly string[]).includes(value);
}

/**
 * An org-standard template (metric definition, schema, dashboard layout, or
 * guardrail policy) in the Org Resource Library. Attaching one to a project
 * is "copy-with-link + version pin" per plan 08 §1.2: `version` increments
 * only when the org resource owner edits the template here, and each
 * attachment (`ResourceAttachmentModel`) records which version it copied so
 * a project can keep an older pin while the org's template moves on.
 */
@Model({
  reference_path: 'organizations/:organization_id/resource_templates',
  path_id: 'resource_template_id',
})
export class ResourceTemplateModel extends BaseModel {
  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public type!: ResourceTemplateType;

  @Field({ is_required: true })
  public version!: number;

  /** Opaque template payload — shape is owned by whichever later story consumes this `type`. */
  @Field()
  public config?: Record<string, unknown>;

  @Field({ is_required: true })
  public created_by!: string;
}
