import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { resolveAdStudioMediaStorage } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';
import { getAdStudioBrief } from '@/lib/ad-studio/store';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; pageId: string }>;
}

export const dynamic = 'force-dynamic';

/** Streams either the full-page PNG screenshot (`?kind=image`) or the scrolling MP4 video for one scanned site page. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { orgId, projectId, briefId, pageId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;

  try {
    const brief = await getAdStudioBrief(orgId, projectId, briefId);
    const page = (brief.site_pages ?? []).find((entry) => entry.id === pageId);
    if (!page) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const kind = request.nextUrl.searchParams.get('kind');
    const isImage = kind === 'image';
    const objectPath = isImage ? page.screenshotGcsPath : page.scrollVideoGcsPath;
    if (!objectPath) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return await streamAdStudioMedia(
      resolveAdStudioMediaStorage(),
      objectPath,
      request.headers.get('range'),
      isImage ? 'image/png' : 'video/mp4',
    );
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
