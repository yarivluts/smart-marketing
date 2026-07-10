import { NextResponse, type NextRequest } from 'next/server';
import {
  FieldMappingNotFoundError,
  HookDeliveryNotFoundError,
  InvalidFieldMappingError,
  InvalidSamplePayloadError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { testRunFieldMapping } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { parseFieldMappingRulesBody } from '@/lib/orgs/parse-field-mapping-rules';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Runs a mapping (saved or an in-progress draft) against one sample payload
 * without persisting anything (KAN-54 AC: "test-run on sample") — gated on
 * `ingest.write`. The sample is either pasted JSON (`samplePayload`) or an
 * already-queued hook delivery's raw payload (`hookDeliveryId`, KAN-53),
 * read-only either way.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{
    fieldMappingId?: unknown;
    kind?: unknown;
    schemaName?: unknown;
    rules?: unknown;
    samplePayload?: unknown;
    hookDeliveryId?: unknown;
  }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { fieldMappingId, kind, schemaName, rules: rawRules, samplePayload, hookDeliveryId } = parsed.body;

  if (typeof samplePayload !== 'string' && typeof hookDeliveryId !== 'string') {
    return NextResponse.json({ error: 'sample_required' }, { status: 400 });
  }

  let draftKind: string | undefined;
  let draftSchemaName: string | undefined;
  let draftRules;
  if (typeof fieldMappingId !== 'string' || fieldMappingId.trim().length === 0) {
    if (typeof kind !== 'string' || kind.trim().length === 0) {
      return NextResponse.json({ error: 'kind_required' }, { status: 400 });
    }
    if (typeof schemaName !== 'string' || schemaName.trim().length === 0) {
      return NextResponse.json({ error: 'schema_name_required' }, { status: 400 });
    }
    const parsedRules = parseFieldMappingRulesBody(rawRules);
    if (parsedRules.error) {
      return parsedRules.error;
    }
    draftKind = kind;
    draftSchemaName = schemaName;
    draftRules = parsedRules.rules;
  }

  try {
    const result = await testRunFieldMapping({
      organizationId: orgId,
      projectId,
      fieldMappingId: typeof fieldMappingId === 'string' && fieldMappingId.trim().length > 0 ? fieldMappingId : undefined,
      kind: draftKind,
      schemaName: draftSchemaName,
      rules: draftRules,
      samplePayload: typeof samplePayload === 'string' ? samplePayload : undefined,
      hookDeliveryId: typeof hookDeliveryId === 'string' ? hookDeliveryId : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof HookDeliveryNotFoundError || err instanceof FieldMappingNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidSamplePayloadError) {
      return NextResponse.json({ error: 'invalid_sample_payload' }, { status: 400 });
    }
    if (err instanceof InvalidFieldMappingError) {
      return NextResponse.json({ error: 'invalid_rules', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
