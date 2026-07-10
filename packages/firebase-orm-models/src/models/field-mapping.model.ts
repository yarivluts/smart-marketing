import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { MappingRule } from '@growthos/shared';
import type { SchemaDefKind } from './schema-def.model';

/**
 * A saved mapping (KAN-54, E9.2: plan `12 §2.4` — "Payloads are stored raw,
 * then transformed by a saved mapping ... unmapped payloads sit in a review
 * queue") turning a raw inbound-webhook payload (KAN-53's
 * `HookDeliveryModel.raw_payload`) into a valid ingest record for one
 * registered schema family. `kind`/`schema_name` identify the target family
 * the same way `SchemaDefModel` does; `rules` is the ordered list of
 * JSONPath-to-field rules the pure `@growthos/shared` mapping engine
 * (`applyFieldMapping`) executes.
 *
 * `hook_endpoint_id` is optional context (which endpoint this mapping was
 * built for) rather than an enforced binding — the same mapping's rules
 * could be reused against any payload shaped the same way, e.g. a second
 * hook endpoint receiving the same SaaS's webhooks in a different
 * environment.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/field_mappings',
  path_id: 'field_mapping_id',
})
export class FieldMappingModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  @Field()
  public hook_endpoint_id?: string;

  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public kind!: SchemaDefKind;

  /** The target schema family's `name` (e.g. `order_completed`) — must currently have an `active` `SchemaDefModel` version of this `kind` at create time (see `field-mapping.service.ts`). */
  @Field({ is_required: true })
  public schema_name!: string;

  @Field({ is_required: true })
  public rules!: MappingRule[];

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;

  /** Presence alone means the mapping is retired — the same immediate-revocation posture `HookEndpointModel.disabled_at`/`ApiKeyModel.revoked_at` establish. */
  @Field()
  public disabled_at?: string;

  @Field()
  public disabled_by?: string;
}
