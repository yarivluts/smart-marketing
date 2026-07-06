import { NextResponse } from 'next/server';
import type { SchemaFieldInput } from '@growthos/firebase-orm-models';

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
