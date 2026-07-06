import { NextResponse, type NextRequest } from 'next/server';
import { isSchemaDefKind, type SchemaDefKind, type SchemaFieldInput } from '@growthos/firebase-orm-models';
import { parseJsonBody } from '@/lib/http/parse-json-body';

export type ParsedSchemaFields = { fields: SchemaFieldInput[]; error?: undefined } | { fields?: undefined; error: NextResponse };

/** Shared body-shape validation for the register and evolve schema-def routes — both accept the same `fields` array shape. */
export function parseSchemaFieldsBody(value: unknown): ParsedSchemaFields {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: NextResponse.json({ error: 'fields_required' }, { status: 400 }) };
  }

  const fields: SchemaFieldInput[] = [];
  for (const entry of value) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).name !== 'string' ||
      typeof (entry as Record<string, unknown>).type !== 'string'
    ) {
      return { error: NextResponse.json({ error: 'invalid_fields' }, { status: 400 }) };
    }
    const record = entry as Record<string, unknown>;
    fields.push({
      name: record.name as string,
      type: record.type as string,
      isRequired: Boolean(record.isRequired),
      isPii: Boolean(record.isPii),
      isIdentityKey: Boolean(record.isIdentityKey),
    });
  }

  return { fields };
}

export type ParsedSchemaDefRequest =
  | { kind: SchemaDefKind; name: string; fields: SchemaFieldInput[]; error?: undefined }
  | { kind?: undefined; name?: undefined; fields?: undefined; error: NextResponse };

/** Shared JSON-body parsing + validation for the register and evolve schema-def routes — both accept the identical `{kind, name, fields}` shape. */
export async function parseSchemaDefRequestBody(request: NextRequest): Promise<ParsedSchemaDefRequest> {
  const parsed = await parseJsonBody<{ kind?: unknown; name?: unknown; fields?: unknown }>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const { kind, name, fields: rawFields } = parsed.body;
  if (typeof kind !== 'string' || !isSchemaDefKind(kind)) {
    return { error: NextResponse.json({ error: 'invalid_kind' }, { status: 400 }) };
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { error: NextResponse.json({ error: 'name_required' }, { status: 400 }) };
  }
  const parsedFields = parseSchemaFieldsBody(rawFields);
  if (parsedFields.error) {
    return { error: parsedFields.error };
  }

  return { kind, name: name.trim(), fields: parsedFields.fields };
}
