import { NextResponse, type NextRequest } from 'next/server';
import { InvalidRepCollectionEntryError, RepCollectionEntryNotFoundError } from '@growthos/firebase-orm-models';
import { deleteRepCollectionEntry, updateRepCollectionEntry } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseUpdateRepCollectionEntryRequestBody } from '@/lib/orgs/parse-rep-collection-fields';
import { toRepCollectionEntryRow } from '@/lib/orgs/rep-collection-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; entryId: string }>;
}

/**
 * Reassigns the rep and/or corrects the amount on a ledger entry (KAN-88) —
 * the inline-edit commit path the ledger table's rep picker (on change) and
 * amount cell (on blur) PATCH into. Gated on the same `dashboards.write`
 * permission every other ledger mutation on this route uses.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, entryId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseUpdateRepCollectionEntryRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const entry = await updateRepCollectionEntry(orgId, projectId, entryId, parsed, user.id);
    return NextResponse.json({ entry: toRepCollectionEntryRow(entry) });
  } catch (err) {
    if (err instanceof RepCollectionEntryNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidRepCollectionEntryError) {
      return NextResponse.json({ error: 'invalid_entry', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}

/** Deletes a ledger entry outright (see `deleteRepCollectionEntry`'s own doc comment for why a ledger entry, like a segment or goal, has no keep-forever requirement of its own — it's still audit-logged). */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, entryId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    await deleteRepCollectionEntry(orgId, projectId, entryId, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof RepCollectionEntryNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
