import { NextResponse, type NextRequest } from 'next/server';
import { ProjectNotFoundError, WarehouseNotConfiguredError } from '@growthos/firebase-orm-models';
import { reexportRawRecordsToWarehouse } from '@/lib/orgs/mutations';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Backfills already-landed raw records into the warehouse's raw table (see
 * `reexportRawRecordsToWarehouse`'s own doc comment) — the ingest-health
 * action for records that were accepted before an environment's BigQuery
 * export was configured. Gated on `ingest.write`, same as the DLQ replay
 * this page already offers. 409 when this deployment has no warehouse
 * export at all.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ingest.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ schemaName?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { schemaName } = parsed.body;
  if (schemaName !== undefined && (typeof schemaName !== 'string' || schemaName.trim().length === 0)) {
    return NextResponse.json({ error: 'invalid_schema_name' }, { status: 400 });
  }

  try {
    const result = await reexportRawRecordsToWarehouse({
      organizationId: orgId,
      projectId,
      ...(typeof schemaName === 'string' ? { schemaName: schemaName.trim() } : {}),
      performedByUserId: user.id,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof WarehouseNotConfiguredError) {
      return NextResponse.json({ error: 'warehouse_not_configured' }, { status: 409 });
    }
    throw err;
  }
}
