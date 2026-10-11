import { NextResponse, type NextRequest } from 'next/server';
import { InvalidSegmentError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { suggestSegments } from '@/lib/orgs/mutations';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Proposes candidate segment definitions for one registered entity schema
 * (KAN-81, E14.x, plan `14 §Gap 9` "AI-suggested lists") — gated on
 * `dashboards.write`, the same permission every other segment route
 * reuses. Nothing is saved here; the admin UI merges a chosen suggestion
 * into the create-segment form's own state so the user still edits/submits
 * it themselves, the same "user confirms" step
 * `field-mappings/suggest/route.ts` (KAN-55) establishes.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ schemaName?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { schemaName } = parsed.body;

  if (typeof schemaName !== 'string' || schemaName.trim().length === 0) {
    return NextResponse.json({ error: 'schema_name_required' }, { status: 400 });
  }

  try {
    const result = await suggestSegments({ organizationId: orgId, projectId, schemaName });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidSegmentError) {
      return NextResponse.json({ error: 'invalid_segment', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
