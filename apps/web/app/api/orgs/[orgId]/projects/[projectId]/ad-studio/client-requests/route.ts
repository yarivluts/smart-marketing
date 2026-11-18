import { NextResponse, type NextRequest } from 'next/server';
import {
  AdShareFeedbackInvalidError,
  AdStudioBriefNotFoundError,
  createAdShareFeedback,
  getAdStudioBrandKit,
  listAdShareFeedbackForProject,
  listAdShareProposals,
  listAdStudioBriefs,
} from '@growthos/firebase-orm-models';
import {
  buildClientFeedbackFixPrompt,
  buildClientFeedbackReport,
  type AdShareTargetKind,
  type AdShareVerdict,
  type ClientFixPromptBriefSnapshot,
} from '@growthos/shared';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { proposeChangesFromClientFeedback, resolveAdStudioLlm } from '@/lib/ad-studio/engine';
import { listOrgProjects } from '@/lib/orgs/queries';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists client feedback, AI proposals, Markdown return report, and fix-agent prompt. Gated on `ai.use`. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  await ensureFirestoreOrm();

  try {
    const locale = request.nextUrl.searchParams.get('locale') === 'he' ? 'he' : 'en';
    const [feedback, proposals, projects, brandKit, briefModels] = await Promise.all([
      listAdShareFeedbackForProject(orgId, projectId),
      listAdShareProposals(orgId, projectId),
      listOrgProjects(orgId),
      getAdStudioBrandKit(orgId, projectId),
      listAdStudioBriefs(orgId, projectId),
    ]);
    const projectName = projects.find((p) => p.id === projectId)?.name ?? projectId;
    const briefs: ClientFixPromptBriefSnapshot[] = briefModels.map((b) => ({
      id: b.id,
      name: b.name,
      objective: b.objective,
      productDescription: b.product_description,
      landingPageUrl: b.landing_page_url ?? null,
      language: b.language,
      videoInstructions: b.video_settings?.instructions ?? null,
      videoCopy: b.video_copy ?? null,
      scenes: (b.scenes ?? []).map((s) => ({
        id: s.id,
        durationSeconds: s.durationSeconds,
        visualPrompt: s.visualPrompt,
        voiceover: s.voiceover,
      })),
      imageConcepts: (b.image_concepts ?? []).map((c) => ({
        id: c.id,
        headline: c.headline,
        visualPrompt: c.visualPrompt,
        ...(c.copy ? { copy: c.copy } : {}),
      })),
      searchAd: b.search_ad ?? null,
    }));
    return NextResponse.json(
      {
        feedback,
        proposals,
        reportMarkdown: buildClientFeedbackReport({
          projectName,
          brandName: brandKit.brandName,
          generatedAt: new Date().toISOString(),
          locale,
          items: feedback,
        }),
        fixAgentPrompt: buildClientFeedbackFixPrompt({
          projectName,
          brandName: brandKit.brandName,
          items: feedback,
          briefs,
        }),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/** Either adds a manual client request (`action: 'add_request'`) or synthesizes AI proposals from open requests. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  await ensureFirestoreOrm();

  const parsed = await parseJsonBody<{
    action?: unknown;
    feedbackIds?: unknown;
    locale?: unknown;
    clientLabel?: unknown;
    authorName?: unknown;
    targetKind?: unknown;
    briefId?: unknown;
    verdict?: unknown;
    comment?: unknown;
  }>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};

  if (body.action === 'add_request') {
    try {
      const item = await createAdShareFeedback({
        organizationId: orgId,
        projectId,
        shareLinkId: 'manual',
        clientLabel: typeof body.clientLabel === 'string' ? body.clientLabel : '',
        authorName: typeof body.authorName === 'string' ? body.authorName : undefined,
        targetKind: (typeof body.targetKind === 'string' ? body.targetKind : 'general') as AdShareTargetKind,
        briefId: typeof body.briefId === 'string' && body.briefId.trim() ? body.briefId.trim() : null,
        verdict: (typeof body.verdict === 'string' ? body.verdict : 'request') as AdShareVerdict,
        comment: typeof body.comment === 'string' ? body.comment : undefined,
      });
      return NextResponse.json({ item }, { status: 201, headers: { 'cache-control': 'no-store' } });
    } catch (err) {
      if (err instanceof AdShareFeedbackInvalidError) {
        return NextResponse.json({ error: 'invalid_feedback', reasons: err.reasons }, { status: 400 });
      }
      if (err instanceof AdStudioBriefNotFoundError) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      return adStudioErrorResponse(err);
    }
  }

  const llm = resolveAdStudioLlm();
  if (!llm) {
    return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  }

  const feedbackIds = Array.isArray(body.feedbackIds)
    ? body.feedbackIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : undefined;
  const targetLocale = typeof body.locale === 'string' ? body.locale : undefined;

  try {
    const result = await proposeChangesFromClientFeedback({
      organizationId: orgId,
      projectId,
      actorId: user.id,
      llm,
      feedbackIds,
      targetLocale,
    });
    return NextResponse.json(result, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
