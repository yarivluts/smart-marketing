import { NextResponse, type NextRequest } from 'next/server';
import { EnvironmentNotFoundError, InvalidFieldMappingError, ProjectNotFoundError, TargetSchemaNotRegisteredError } from '@growthos/firebase-orm-models';
import { createFieldMapping } from '@/lib/orgs/mutations';
import { listFieldMappingsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseCreateFieldMappingRequestBody } from '@/lib/orgs/parse-field-mapping-rules';
import { toFieldMappingView } from '@/lib/orgs/field-mapping-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists every saved field mapping (active or disabled) for one project (KAN-54) — gated on `ingest.write`, the same permission the sibling Hooks admin surface (KAN-53) reuses for inbound-data management. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const projects = await listOrgProjects(orgId);
  if (!projects.some((project) => project.id === projectId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const fieldMappings = await listFieldMappingsForProject(orgId, projectId);
  return NextResponse.json({ fieldMappings: fieldMappings.map(toFieldMappingView) });
}

/** Saves a new field mapping (KAN-54 AC: "saved field-mappings"). Requires the target schema to already have an active version registered (KAN-31). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const parsed = await parseCreateFieldMappingRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const mapping = await createFieldMapping({
      organizationId: orgId,
      projectId,
      environmentId: parsed.environmentId,
      hookEndpointId: parsed.hookEndpointId,
      name: parsed.name,
      kind: parsed.kind,
      schemaName: parsed.schemaName,
      rules: parsed.rules,
      createdByUserId: user.id,
    });
    return NextResponse.json({ fieldMapping: toFieldMappingView(mapping) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof EnvironmentNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof TargetSchemaNotRegisteredError) {
      return NextResponse.json({ error: 'target_schema_not_registered' }, { status: 400 });
    }
    if (err instanceof InvalidFieldMappingError) {
      return NextResponse.json({ error: 'invalid_rules', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
