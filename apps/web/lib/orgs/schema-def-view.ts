import type { SchemaDefModel } from '@growthos/firebase-orm-models';

export interface SchemaDefFieldView {
  name: string;
  type: string;
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

export interface SchemaDefView {
  id: string;
  kind: string;
  name: string;
  version: number;
  status: string;
  fields: SchemaDefFieldView[];
  createdBy: string;
  createdAt: string;
}

/**
 * A `SchemaDefModel` instance doesn't serialize cleanly through
 * `NextResponse.json` (its `id` and other fields are backed by getters, the
 * same reason every other route in this codebase — e.g. `credentials/route.ts`
 * — returns a mapped plain object instead of the raw model). This is the
 * shared mapping for the register/evolve/list schema-def routes.
 */
export function toSchemaDefView(schemaDef: SchemaDefModel): SchemaDefView {
  return {
    id: schemaDef.id,
    kind: schemaDef.kind,
    name: schemaDef.name,
    version: schemaDef.version,
    status: schemaDef.status,
    fields: schemaDef.field_defs.map((field) => ({
      name: field.name,
      type: field.type,
      isRequired: field.is_required,
      isPii: field.is_pii,
      isIdentityKey: field.is_identity_key,
    })),
    createdBy: schemaDef.created_by,
    createdAt: schemaDef.created_at,
  };
}
