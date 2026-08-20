import { NextResponse } from 'next/server';
import { syncAllSchemaMartViewsForProject } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * (Re)creates the BigQuery mart view for every active measure/entity schema
 * in the project (KAN-18 custom-schema marts — see
 * `@growthos/firebase-orm-models`'s `schema-mart.service.ts`). Register/
 * evolve already sync their own schema's view; this is the backfill/repair
 * sweep for schemas registered before mart generation existed. Gated on
 * `schema.write`, same as every other action on the schema registry page.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'schema.write');
  if (error) {
    return error;
  }

  await ensureFirestoreOrm();
  const result = await syncAllSchemaMartViewsForProject(orgId, projectId);
  return NextResponse.json(result);
}
