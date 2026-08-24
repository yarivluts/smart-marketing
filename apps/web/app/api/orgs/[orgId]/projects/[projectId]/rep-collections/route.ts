import { NextResponse, type NextRequest } from 'next/server';
import { InvalidRepCollectionEntryError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { createRepCollectionEntry } from '@/lib/orgs/mutations';
import { listRepCollectionEntriesForProject } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseCreateRepCollectionEntryRequestBody } from '@/lib/orgs/parse-rep-collection-fields';
import { toRepCollectionEntryRow } from '@/lib/orgs/rep-collection-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists a project's rep-attributed collections ledger (KAN-88), newest-`occurredAt`-first — gated on `dashboards.write`, the same permission Goals/Segments/Campaign Ops use for a project-scoped editable-attribution admin surface. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    const entries = await listRepCollectionEntriesForProject(orgId, projectId);
    return NextResponse.json({ entries: entries.map(toRepCollectionEntryRow) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/** Logs one entry to the ledger (KAN-88) — either a fully manual entry, or a confirmed billing signal (`sourceRawRecordId` set), from this page's own create form. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseCreateRepCollectionEntryRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const entry = await createRepCollectionEntry({
      organizationId: orgId,
      projectId,
      orgPersonId: parsed.orgPersonId,
      company: parsed.company,
      collectionType: parsed.collectionType,
      planFrom: parsed.planFrom,
      planTo: parsed.planTo,
      amount: parsed.amount,
      occurredAt: parsed.occurredAt,
      note: parsed.note,
      sourceRawRecordId: parsed.sourceRawRecordId,
      createdByUserId: user.id,
    });
    return NextResponse.json({ entry: toRepCollectionEntryRow(entry) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidRepCollectionEntryError) {
      return NextResponse.json({ error: 'invalid_entry', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
