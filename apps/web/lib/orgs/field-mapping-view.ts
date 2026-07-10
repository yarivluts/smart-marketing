import type { FieldMappingModel, MappingRule, SchemaDefKind } from '@growthos/firebase-orm-models';

export interface FieldMappingRuleView {
  targetField: string;
  transform: MappingRule['transform'];
  sourcePath?: string;
  castType?: MappingRule['castType'];
  template?: string;
  staticValue?: string;
}

export interface FieldMappingView {
  id: string;
  environmentId: string;
  hookEndpointId?: string;
  name: string;
  kind: SchemaDefKind;
  schemaName: string;
  rules: FieldMappingRuleView[];
  createdBy: string;
  createdAt: string;
  disabledAt?: string;
}

/** A `FieldMappingModel` instance doesn't serialize cleanly through `NextResponse.json` — same reasoning `toSchemaDefView` documents. */
export function toFieldMappingView(mapping: FieldMappingModel): FieldMappingView {
  return {
    id: mapping.id,
    environmentId: mapping.environment_id,
    hookEndpointId: mapping.hook_endpoint_id,
    name: mapping.name,
    kind: mapping.kind,
    schemaName: mapping.schema_name,
    rules: mapping.rules.map((rule) => ({
      targetField: rule.targetField,
      transform: rule.transform,
      sourcePath: rule.sourcePath,
      castType: rule.castType,
      template: rule.template,
      staticValue: rule.staticValue,
    })),
    createdBy: mapping.created_by,
    createdAt: mapping.created_at,
    disabledAt: mapping.disabled_at,
  };
}
