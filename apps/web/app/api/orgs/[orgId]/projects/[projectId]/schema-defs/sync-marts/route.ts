import { NextResponse } from 'next/server';
import { syncAllSchemaMartViewsForProject } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { listOrgProjects } from '@/lib/orgs/queries';
import { requireProjectPermission } from '@/lib/orgs/access';

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
 *
 * Validates `projectId` belongs to the org first (404 otherwise) — same
 * convention this route's sibling GET/POST on `schema-defs/route.ts`
 * documents: `listSchemaDefinitionsForProject` doesn't itself check the
 * project exists, so a project id from a different org would otherwise
 * silently return a 200 with an empty result.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'schema.write');
  if (error) {
    return error;
  }

  await ensureFirestoreOrm();
  const projects = await listOrgProjects(orgId);
  if (!projects.some((project) => project.id === projectId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const result = await syncAllSchemaMartViewsForProject(orgId, projectId);
  return NextResponse.json(result);
}
