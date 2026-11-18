import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import {
  resolveAdStudioLlm,
  scanBriefSitePages,
  setBriefSitePageSelection,
} from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Scans the brief's public website without requiring login details (homepage + ad-relevant internal
 * product/offer pages), renders smooth scrolling clips, and stores them on the brief. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;

  let siteUrl: string | undefined;
  const rawBody = await request.text().catch(() => '');
  if (rawBody.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    if (parsed && typeof parsed === 'object' && 'siteUrl' in parsed) {
      const candidate = (parsed as { siteUrl?: unknown }).siteUrl;
      if (candidate !== undefined && candidate !== null && typeof candidate !== 'string') {
        return NextResponse.json({ error: 'site_scroll', code: 'invalid_url' }, { status: 400 });
      }
      siteUrl = typeof candidate === 'string' ? candidate : undefined;
    }
  }

  try {
    const sitePages = await scanBriefSitePages(
      {
        organizationId: orgId,
        projectId,
        briefId,
        actorId: user.id,
        siteUrl,
      },
      { llm: resolveAdStudioLlm() },
    );
    return NextResponse.json({ sitePages });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/** Updates which scanned website scrolling clips are automatically woven into the assembled video. */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;

  const parsed = await parseJsonBody<{ selectedPageIds?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const selected = parsed.body?.selectedPageIds;
  if (!Array.isArray(selected) || selected.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const sitePages = await setBriefSitePageSelection({
      organizationId: orgId,
      projectId,
      briefId,
      selectedPageIds: selected,
    });
    return NextResponse.json({ sitePages });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
