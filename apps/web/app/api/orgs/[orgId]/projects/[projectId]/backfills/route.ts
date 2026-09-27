import { NextResponse, type NextRequest } from 'next/server';
import { BackfillEndpointNotConfiguredError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { requestProjectBackfill } from '@/lib/orgs/mutations';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** The "Request backfill" button: asks this environment's endpoint to resend its records. Gated on `project.configure`. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) {
    return error;
  }
  const parsed = await parseJsonBody<{ environmentId?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  if (typeof parsed.body.environmentId !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  try {
    const status = await requestProjectBackfill({ organizationId: orgId, projectId, environmentId: parsed.body.environmentId, requestedByUserId: user.id });
    return NextResponse.json({ backfill: status }, { status: 200 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof BackfillEndpointNotConfiguredError) {
      return NextResponse.json({ error: 'no_endpoint' }, { status: 409 });
    }
    throw err;
  }
}
