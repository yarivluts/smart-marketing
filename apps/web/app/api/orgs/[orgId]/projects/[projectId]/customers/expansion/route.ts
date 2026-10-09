import { NextResponse, type NextRequest } from 'next/server';
import { ExpansionRadarService } from '@growthos/firebase-orm-models';
import type { AccountSegment } from '@growthos/shared';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const { searchParams } = new URL(request.url);
  const segmentParam = (searchParams.get('segment') || 'all') as AccountSegment;

  try {
    const telemetry = await ExpansionRadarService.getCustomerExpansionRadarTelemetry(
      orgId,
      projectId,
      segmentParam,
    );
    return NextResponse.json({ ok: true, telemetry });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to query customer expansion telemetry';
    return NextResponse.json({ error: 'expansion_telemetry_query_failed', message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    const body = await request.json().catch(() => ({}));

    if (!body.customerId || !body.accountName) {
      return NextResponse.json(
        { error: 'invalid_payload', message: 'customerId and accountName are required' },
        { status: 400 },
      );
    }

    const event = await ExpansionRadarService.recordCustomerExpansionEvent({
      organizationId: orgId,
      projectId,
      customerId: body.customerId,
      accountName: body.accountName,
      previousStatus: body.previousStatus,
      currentStatus: body.currentStatus || 'active',
      previousMrr: Number(body.previousMrr || 0),
      currentMrr: Number(body.currentMrr || 0),
      previousTier: body.previousTier,
      currentTier: body.currentTier,
      seatCount: body.seatCount ? Number(body.seatCount) : undefined,
      previousSeatCount: body.previousSeatCount ? Number(body.previousSeatCount) : undefined,
      triggerReason: body.triggerReason,
      recordedAt: body.recordedAt,
    });

    return NextResponse.json({
      ok: true,
      event,
      message: `Account expansion event recorded for ${body.accountName}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record customer expansion event';
    return NextResponse.json({ error: 'expansion_event_record_failed', message }, { status: 500 });
  }
}
