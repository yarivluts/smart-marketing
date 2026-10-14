import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { toAdStudioBriefView } from '@/lib/ad-studio/store';
import {
  AdStudioSiteError,
  createAdStudioBriefFromSite,
  resolveAdStudioImageGenerator,
  resolveAdStudioLlm,
  resolveAdStudioOmni,
  startAdStudioAutopilot,
  toAdStudioRunView,
} from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Makes a new ad from nothing but a website: the AI reads the site and writes the brief, then the
 * autopilot starts on it with defaults (deep plan, image ideas, images in square and portrait, and
 * the video when a video model exists), stopping for the person to confirm the plan before anything
 * is rendered. 201 `{brief, run}`; 422 `{error: 'site', reason}` when the site cannot be used.
 * Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ siteUrl?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const siteUrl = typeof parsed.body?.siteUrl === 'string' ? parsed.body.siteUrl : '';
  const llm = resolveAdStudioLlm();
  if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    await ensureFirestoreOrm();
    const brief = await createAdStudioBriefFromSite({ organizationId: orgId, projectId, actorId: user.id, llm, siteUrl });
    const { selected } = await resolveSelectedEnvironment(orgId, projectId);
    const images = resolveAdStudioImageGenerator() !== null;
    const run = await startAdStudioAutopilot({
      organizationId: orgId,
      projectId,
      briefId: brief.id,
      actorId: user.id,
      options: { plan: true, images, imageFormats: ['square', 'portrait'], video: resolveAdStudioOmni() !== null, confirmPlan: true, environmentId: selected?.id ?? null },
    });
    return NextResponse.json({ brief: toAdStudioBriefView(brief), run: toAdStudioRunView(run) }, { status: 201 });
  } catch (err) {
    if (err instanceof AdStudioSiteError) return NextResponse.json({ error: 'site', reason: err.reason }, { status: 422 });
    return adStudioErrorResponse(err);
  }
}
