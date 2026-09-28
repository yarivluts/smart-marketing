import { NextResponse, type NextRequest } from 'next/server';
import { AdStudioExportInvalidError, AdStudioExportUnavailableError, type YouTubePrivacyStatus } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { AdStudioExportVideoNotReadyError, exportBriefVideo } from '@/lib/ad-studio/engine';
import { toAdStudioExportView } from '@/lib/ad-studio/store';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Uploads an assembled video to the project's Meta ad account video library or its YouTube channel
 * (KAN-232). Sending content to an ad platform is an outward change, so it is gated on
 * `automation.execute` - the permission that already gates executing changes on those platforms -
 * and audited. Returns the export record, done or failed with its code.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'automation.execute');
  if (error) return error;
  const parsed = await parseJsonBody<{ videoId?: unknown; destination?: unknown; title?: unknown; description?: unknown; privacy?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  if (typeof body.videoId !== 'string' || (body.destination !== 'meta' && body.destination !== 'youtube')) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  try {
    const row = await exportBriefVideo({
      organizationId: orgId,
      projectId,
      briefId,
      videoId: body.videoId,
      destination: body.destination,
      title: typeof body.title === 'string' ? body.title : '',
      description: typeof body.description === 'string' ? body.description : '',
      ...(typeof body.privacy === 'string' ? { privacy: body.privacy as YouTubePrivacyStatus } : {}),
      actorId: user.id,
    });
    return NextResponse.json({ export: toAdStudioExportView(row) }, { status: row.status === 'done' ? 201 : 502 });
  } catch (err) {
    if (err instanceof AdStudioExportUnavailableError) {
      return NextResponse.json({ error: 'export_unavailable', reason: err.reason }, { status: 409 });
    }
    if (err instanceof AdStudioExportInvalidError) {
      return NextResponse.json({ error: 'invalid_export', reasons: err.reasons }, { status: 400 });
    }
    if (err instanceof AdStudioExportVideoNotReadyError) {
      return NextResponse.json({ error: 'video_not_ready' }, { status: 409 });
    }
    return adStudioErrorResponse(err);
  }
}
