import { NextResponse, type NextRequest } from 'next/server';
import { listHookDeliveriesForProject, listOrgProjects } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists every delivery (any status) landed for one project's hook endpoints — the review queue (KAN-53 AC: "unknown payloads visible in queue"), gated on `ingest.write`. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const projects = await listOrgProjects(orgId);
  if (!projects.some((project) => project.id === projectId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const deliveries = await listHookDeliveriesForProject(orgId, projectId);
  return NextResponse.json({
    hookDeliveries: deliveries.map((delivery) => ({
      id: delivery.id,
      hookEndpointId: delivery.hook_endpoint_id,
      environmentId: delivery.environment_id,
      rawPayload: delivery.raw_payload,
      headers: delivery.headers,
      signatureVerified: delivery.signature_verified,
      status: delivery.status,
      receivedAt: delivery.received_at,
    })),
  });
}
