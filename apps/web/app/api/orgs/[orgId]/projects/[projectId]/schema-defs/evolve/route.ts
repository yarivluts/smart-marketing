import { NextResponse, type NextRequest } from 'next/server';
import {
  BreakingSchemaChangeError,
  InvalidSchemaDefinitionError,
  isSchemaDefKind,
  ProjectNotFoundError,
  SchemaDefNotFoundError,
} from '@growthos/firebase-orm-models';
import { evolveSchemaDefinition } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { parseSchemaFieldsBody } from '@/lib/orgs/parse-schema-fields';
import { toSchemaDefView } from '@/lib/orgs/schema-def-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Registers the next version of an already-registered schema (KAN-31 AC:
 * "evolve to v2 -> both queryable; breaking change rejected"). The previous
 * version is never mutated in place — see `evolveSchemaDefinition`'s own
 * doc comment — so a 201 here means a brand new version document now exists
 * alongside the one it evolved from.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'schema.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ kind?: unknown; name?: unknown; fields?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { kind, name, fields: rawFields } = parsed.body;
  if (typeof kind !== 'string' || !isSchemaDefKind(kind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  const parsedFields = parseSchemaFieldsBody(rawFields);
  if (parsedFields.error) {
    return parsedFields.error;
  }

  try {
    const schemaDef = await evolveSchemaDefinition({
      organizationId: orgId,
      projectId,
      kind,
      name: name.trim(),
      fields: parsedFields.fields,
      createdByUserId: user.id,
    });
    return NextResponse.json({ schemaDef: toSchemaDefView(schemaDef) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof SchemaDefNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof BreakingSchemaChangeError) {
      return NextResponse.json({ error: 'breaking_change', violations: err.violations }, { status: 409 });
    }
    if (err instanceof InvalidSchemaDefinitionError) {
      return NextResponse.json({ error: 'invalid_fields', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
