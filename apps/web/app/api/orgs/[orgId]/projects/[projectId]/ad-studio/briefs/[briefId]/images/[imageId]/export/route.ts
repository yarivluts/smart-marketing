import { NextResponse, type NextRequest } from 'next/server';
import { AdStudioExportInvalidError, AdStudioExportUnavailableError, AD_STUDIO_IMAGE_EXPORT_DESTINATIONS, type AdStudioImageExportDestination } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { exportBriefImage } from '@/lib/ad-studio/engine';
import { toAdStudioExportView } from '@/lib/ad-studio/store';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; imageId: string }>;
}

/**
 * Uploads a ready image to Meta's ad image library or as a Google Ads image asset. An outward change
 * on an ad platform, so it is gated on `automation.execute` - like a video export - and audited.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, imageId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'automation.execute');
  if (error) return error;
  const parsed = await parseJsonBody<{ destination?: unknown; title?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const destination = parsed.body?.destination;
  if (typeof destination !== 'string' || !(AD_STUDIO_IMAGE_EXPORT_DESTINATIONS as readonly string[]).includes(destination)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  try {
    const row = await exportBriefImage({
      organizationId: orgId,
      projectId,
      briefId,
      imageId,
      destination: destination as AdStudioImageExportDestination,
      title: typeof parsed.body?.title === 'string' ? parsed.body.title : '',
      actorId: user.id,
    });
    return NextResponse.json({ export: toAdStudioExportView(row) }, { status: row.status === 'done' ? 201 : 502 });
  } catch (err) {
    if (err instanceof AdStudioExportUnavailableError) return NextResponse.json({ error: 'export_unavailable', reason: err.reason }, { status: 409 });
    if (err instanceof AdStudioExportInvalidError) return NextResponse.json({ error: 'invalid_export', reasons: err.reasons }, { status: 400 });
    return adStudioErrorResponse(err);
  }
}
