import { NextResponse, type NextRequest } from 'next/server';
import { DuplicateSchemaDefinitionError, InvalidSchemaDefinitionError, isSchemaDefKind, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { registerSchemaDefinition } from '@/lib/orgs/mutations';
import { listOrgProjects, listSchemaDefinitionsForProject } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { parseSchemaFieldsBody } from '@/lib/orgs/parse-schema-fields';
import { toSchemaDefView } from '@/lib/orgs/schema-def-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Lists every version of every schema family registered in a project (KAN-31)
 * — an admin surface gated on `schema.write`. Validates `projectId` belongs
 * to the org first (404 otherwise), matching the same convention the keys
 * route (KAN-30) established: without this check a project id from a
 * different org would silently return an empty `200` instead of the `404`
 * this route's own POST returns for the same input.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'schema.write');
  if (error) {
    return error;
  }

  const projects = await listOrgProjects(orgId);
  if (!projects.some((project) => project.id === projectId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const schemaDefs = await listSchemaDefinitionsForProject(orgId, projectId);
  return NextResponse.json({ schemaDefs: schemaDefs.map(toSchemaDefView) });
}

/** Registers v1 of a new entity/event/measure schema (KAN-31 AC: "register v1"). */
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
    const schemaDef = await registerSchemaDefinition({
      organizationId: orgId,
      projectId,
      kind,
      name: name.trim(),
      fields: parsedFields.fields,
      createdByUserId: user.id,
    });
    return NextResponse.json({ schemaDef: toSchemaDefView(schemaDef) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof DuplicateSchemaDefinitionError) {
      return NextResponse.json({ error: 'duplicate_schema' }, { status: 409 });
    }
    if (err instanceof InvalidSchemaDefinitionError) {
      return NextResponse.json({ error: 'invalid_fields', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
