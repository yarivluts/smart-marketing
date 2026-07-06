import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/** What a schema describes (plan `08 §1`/`12 §2`): an entity, an event, or a pre-aggregated measure. */
export const SCHEMA_DEF_KINDS = ['entity', 'event', 'measure'] as const;
export type SchemaDefKind = (typeof SCHEMA_DEF_KINDS)[number];

export function isSchemaDefKind(value: string): value is SchemaDefKind {
  return (SCHEMA_DEF_KINDS as readonly string[]).includes(value);
}

/** Field type vocabulary a `SchemaDefModel.fields` entry may declare. */
export const SCHEMA_FIELD_TYPES = ['string', 'number', 'boolean', 'timestamp', 'object', 'array'] as const;
export type SchemaFieldType = (typeof SCHEMA_FIELD_TYPES)[number];

export function isSchemaFieldType(value: string): value is SchemaFieldType {
  return (SCHEMA_FIELD_TYPES as readonly string[]).includes(value);
}

/**
 * One field declared on a schema version: its type, whether it's required,
 * whether it carries PII (plan `08 §5.4`'s PII gate reads this at the field
 * level), and whether it's one of the event's identity keys (plan `08 §1`:
 * "any event can carry one or more identity keys ... the stitching engine
 * works off registered identity keys, not hard-coded ones").
 */
export interface SchemaFieldDef {
  name: string;
  type: SchemaFieldType;
  is_required: boolean;
  is_pii: boolean;
  is_identity_key: boolean;
}

/**
 * `active`: the current version new ingest should validate against.
 * `superseded`: an earlier version, kept (never deleted or mutated) so it
 * stays independently queryable after evolution — KAN-31 AC "register v1 ->
 * evolve to v2 -> both queryable".
 */
export const SCHEMA_DEF_STATUSES = ['active', 'superseded'] as const;
export type SchemaDefStatus = (typeof SCHEMA_DEF_STATUSES)[number];

/**
 * One versioned definition of an entity/event/measure schema, scoped to a
 * project (plan `08 §1`: "each project registers schemas ... schemas are
 * versioned"). A schema "family" is identified by `(project_id, kind, name)`;
 * each evolution creates a brand-new document rather than mutating an
 * existing one, so every past version stays queryable — see
 * `schema-registry.service.ts` for the versioning/breaking-change rules.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/schema_defs',
  path_id: 'schema_def_id',
})
export class SchemaDefModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public kind!: SchemaDefKind;

  /** The schema's key within its kind, e.g. `order_completed`. */
  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public version!: number;

  @Field({ is_required: true })
  public status!: SchemaDefStatus;

  /**
   * Named `field_defs`, not `fields` — `@arbel/firebase-orm`'s `@Field`
   * decorator stores its own per-class field metadata on a `fields` property
   * of the model's prototype, so a model field actually named `fields` would
   * collide with the ORM's internal bookkeeping (surfaces as a confusing
   * "Cannot read properties of undefined" at class-decoration time).
   */
  @Field({ is_required: true })
  public field_defs!: SchemaFieldDef[];

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;
}
