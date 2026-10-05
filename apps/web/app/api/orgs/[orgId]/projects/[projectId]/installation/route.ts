import { NextResponse, type NextRequest } from 'next/server';
import { verifyInstallationForEnvironment } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { listEnvironmentsForProject } from '@/lib/orgs/queries';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Enough for any site, small enough to stay one cheap read per schema. */
const MAX_EXPECTED_SCHEMAS = 50;

/**
 * The installation check the Installation page polls: for `?environmentId=` (required) and the
 * schema names in `?expect=a,b` (every schema registered or sent when absent), what really
 * arrived - receiving, stale, quarantined, registered with no data, not registered - with the fix.
 * Read-only. Gated on `ingest.write`, like Ingest health, since it shows rejection reasons.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ingest.write');
  if (error) return error;
  const environmentId = request.nextUrl.searchParams.get('environmentId') ?? '';
  const expected = (request.nextUrl.searchParams.get('expect') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (expected.length > MAX_EXPECTED_SCHEMAS)
    return NextResponse.json({ error: 'too_many_schemas' }, { status: 400 });
  const environments = await listEnvironmentsForProject(orgId, projectId);
  if (!environments.some((environment) => environment.id === environmentId))
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await ensureFirestoreOrm();
  return NextResponse.json(
    await verifyInstallationForEnvironment({
      organizationId: orgId,
      projectId,
      environmentId,
      expected,
    }),
  );
}
