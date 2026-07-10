import { NextResponse, type NextRequest } from 'next/server';
import type { MappingRuleInput } from '@growthos/firebase-orm-models';
import { parseJsonBody } from '@/lib/http/parse-json-body';

export type ParsedFieldMappingRules = { rules: MappingRuleInput[]; error?: undefined } | { rules?: undefined; error: NextResponse };

/** Shared body-shape validation for the create-mapping and test-run routes — both accept the same `rules` array shape. Deep validation (valid transform, matching envelope fields for the kind, ...) happens in `field-mapping.service.ts`; this layer only checks the JSON shape is parseable at all. */
export function parseFieldMappingRulesBody(value: unknown): ParsedFieldMappingRules {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: NextResponse.json({ error: 'rules_required' }, { status: 400 }) };
  }

  const rules: MappingRuleInput[] = [];
  for (const entry of value) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).targetField !== 'string' ||
      typeof (entry as Record<string, unknown>).transform !== 'string'
    ) {
      return { error: NextResponse.json({ error: 'invalid_rules' }, { status: 400 }) };
    }
    const record = entry as Record<string, unknown>;
    rules.push({
      targetField: record.targetField as string,
      transform: record.transform as string,
      sourcePath: typeof record.sourcePath === 'string' ? record.sourcePath : undefined,
      castType: typeof record.castType === 'string' ? record.castType : undefined,
      template: typeof record.template === 'string' ? record.template : undefined,
      staticValue: typeof record.staticValue === 'string' ? record.staticValue : undefined,
    });
  }

  return { rules };
}

export type ParsedCreateFieldMappingRequest =
  | {
      environmentId: string;
      hookEndpointId?: string;
      name: string;
      kind: string;
      schemaName: string;
      rules: MappingRuleInput[];
      error?: undefined;
    }
  | { error: NextResponse };

/** JSON-body parsing + validation for `POST /field-mappings`. */
export async function parseCreateFieldMappingRequestBody(request: NextRequest): Promise<ParsedCreateFieldMappingRequest> {
  const parsed = await parseJsonBody<{
    environmentId?: unknown;
    hookEndpointId?: unknown;
    name?: unknown;
    kind?: unknown;
    schemaName?: unknown;
    rules?: unknown;
  }>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const { environmentId, hookEndpointId, name, kind, schemaName, rules: rawRules } = parsed.body;
  if (typeof environmentId !== 'string' || environmentId.trim().length === 0) {
    return { error: NextResponse.json({ error: 'environment_id_required' }, { status: 400 }) };
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { error: NextResponse.json({ error: 'name_required' }, { status: 400 }) };
  }
  if (typeof kind !== 'string' || kind.trim().length === 0) {
    return { error: NextResponse.json({ error: 'kind_required' }, { status: 400 }) };
  }
  if (typeof schemaName !== 'string' || schemaName.trim().length === 0) {
    return { error: NextResponse.json({ error: 'schema_name_required' }, { status: 400 }) };
  }
  const parsedRules = parseFieldMappingRulesBody(rawRules);
  if (parsedRules.error) {
    return { error: parsedRules.error };
  }

  return {
    environmentId,
    hookEndpointId: typeof hookEndpointId === 'string' && hookEndpointId.trim().length > 0 ? hookEndpointId : undefined,
    name,
    kind,
    schemaName,
    rules: parsedRules.rules,
  };
}
