import { NextResponse } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { ensureTouchpointSchemaRegistered } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * One-click "set up touchpoint capture" action (KAN-57): idempotently
 * registers the `touchpoint` event schema so the tracker/embed snippet's
 * events don't quarantine with `schema_not_registered`. Gated on
 * `schema.write`, same as every other action on the schema registry page this
 * button lives on.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'schema.write');
  if (error) {
    return error;
  }

  try {
    const result = await ensureTouchpointSchemaRegistered({ organizationId: orgId, projectId, createdByUserId: user.id });
    return NextResponse.json({ registered: result.registered, schemaDefId: result.schemaDef.id });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
