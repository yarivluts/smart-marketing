import { NextResponse, type NextRequest } from 'next/server';
import { InvalidRepCollectionError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { isCollectionActivityType } from '@growthos/shared';
import { recordCollectionActivity } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Appends one entry to a customer's collections activity ledger (KAN-88) — `LogCollectionActivityForm`'s submit path. Gated on `dashboards.write`, the same permission `PATCH .../rep-collections/customers/[customerId]` uses. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const { customerId, personId, activityType, note } = (body ?? {}) as {
    customerId?: unknown;
    personId?: unknown;
    activityType?: unknown;
    note?: unknown;
  };
  if (typeof customerId !== 'string' || customerId.length === 0) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (typeof personId !== 'string' || personId.length === 0) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (!isCollectionActivityType(activityType)) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (note !== undefined && typeof note !== 'string') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const activity = await recordCollectionActivity(orgId, projectId, customerId, personId, activityType, note, user.id);
    return NextResponse.json({ id: activity.id, customerId: activity.customer_id, activityType: activity.activity_type }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidRepCollectionError) {
      return NextResponse.json({ error: 'invalid_activity', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
