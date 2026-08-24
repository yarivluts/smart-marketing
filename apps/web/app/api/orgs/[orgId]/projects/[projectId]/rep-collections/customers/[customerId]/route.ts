import { NextResponse, type NextRequest } from 'next/server';
import { InvalidRepCollectionError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { assignCustomerOwner, unassignCustomerOwner } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; customerId: string }>;
}

/**
 * Assigns (or reassigns) a customer's collections owner (KAN-88) — the
 * inline-edit commit path `CustomerOwnerSelect` PATCHes on change. Gated on
 * `dashboards.write`, the same permission the Goals/Segments/Campaign Ops
 * admin routes use for a project-scoped editable-target surface.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, customerId } = await params;
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
  const ownerPersonId = (body as { ownerPersonId?: unknown } | null)?.ownerPersonId;
  if (typeof ownerPersonId !== 'string' || ownerPersonId.length === 0) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const owner = await assignCustomerOwner(orgId, projectId, decodeURIComponent(customerId), ownerPersonId, user.id);
    return NextResponse.json({ customerId: owner.customer_id, ownerPersonId: owner.owner_person_id });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidRepCollectionError) {
      return NextResponse.json({ error: 'invalid_owner', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}

/** Clears a customer's collections owner (KAN-88) — reverts to "unassigned" rather than leaving a stale assignment. */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, customerId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    await unassignCustomerOwner(orgId, projectId, decodeURIComponent(customerId), user.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
