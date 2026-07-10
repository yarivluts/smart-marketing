import { NextResponse, type NextRequest } from 'next/server';
import { InvalidFieldMappingError, InvalidSamplePayloadError, ProjectNotFoundError, TargetSchemaNotRegisteredError } from '@growthos/firebase-orm-models';
import { suggestFieldMappingRules } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Proposes field-mapping rules from a sample payload against a registered target schema (KAN-55
 * AC: "LLM proposes field mapping from sample payload; user confirms") — gated on `ingest.write`,
 * the same permission the sibling mapping-CRUD/test-run routes reuse. Nothing is saved here; the
 * admin UI merges the returned suggestions into its own rule-builder state so the user can still
 * edit or drop any of them before creating the mapping.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ kind?: unknown; schemaName?: unknown; samplePayload?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { kind, schemaName, samplePayload } = parsed.body;

  if (typeof kind !== 'string' || kind.trim().length === 0) {
    return NextResponse.json({ error: 'kind_required' }, { status: 400 });
  }
  if (typeof schemaName !== 'string' || schemaName.trim().length === 0) {
    return NextResponse.json({ error: 'schema_name_required' }, { status: 400 });
  }
  if (typeof samplePayload !== 'string' || samplePayload.trim().length === 0) {
    return NextResponse.json({ error: 'sample_required' }, { status: 400 });
  }

  try {
    const result = await suggestFieldMappingRules({ organizationId: orgId, projectId, kind, schemaName, samplePayload });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidSamplePayloadError) {
      return NextResponse.json({ error: 'invalid_sample_payload' }, { status: 400 });
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
