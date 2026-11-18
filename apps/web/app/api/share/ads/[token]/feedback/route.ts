import { NextResponse, type NextRequest } from 'next/server';
import {
  AdShareFeedbackInvalidError,
  AdShareFeedbackLimitError,
  AdStudioBriefNotFoundError,
  createAdShareFeedback,
  listAdShareFeedbackForLink,
} from '@growthos/firebase-orm-models';
import type { AdShareTargetKind, AdShareVerdict } from '@growthos/shared';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { resolveShareLink, sharedNotFound, shareLinkCoversBrief } from '@/lib/ad-studio/share';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/** Lists feedback already submitted on this client share link. Public, token-gated. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { token } = await params;
  const link = await resolveShareLink(token);
  if (!link) return sharedNotFound();

  const feedback = link.allowFeedback
    ? await listAdShareFeedbackForLink(link.organizationId, link.projectId, link.id)
    : [];
  return NextResponse.json(
    { allowFeedback: link.allowFeedback, feedback },
    { headers: { 'cache-control': 'no-store' } },
  );
}

/** Records a client approval, per-ad/campaign note, or new-ad request under an active share link. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { token } = await params;
  const link = await resolveShareLink(token);
  if (!link) return sharedNotFound();
  if (!link.allowFeedback) {
    return NextResponse.json({ error: 'feedback_disabled' }, { status: 403, headers: { 'cache-control': 'no-store' } });
  }

  const parsed = await parseJsonBody<{
    authorName?: unknown;
    targetKind?: unknown;
    briefId?: unknown;
    creativeRef?: unknown;
    campaignId?: unknown;
    campaignLabel?: unknown;
    verdict?: unknown;
    comment?: unknown;
  }>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};

  const briefId = typeof body.briefId === 'string' && body.briefId.trim() ? body.briefId.trim() : null;
  if (briefId && !shareLinkCoversBrief(link, briefId)) {
    return NextResponse.json(
      { error: 'invalid_feedback', reasons: ['brief_not_in_share_link'] },
      { status: 400, headers: { 'cache-control': 'no-store' } },
    );
  }

  try {
    const item = await createAdShareFeedback({
      organizationId: link.organizationId,
      projectId: link.projectId,
      shareLinkId: link.id,
      clientLabel: link.label,
      authorName: typeof body.authorName === 'string' ? body.authorName : undefined,
      targetKind: body.targetKind as AdShareTargetKind,
      briefId,
      creativeRef: typeof body.creativeRef === 'string' ? body.creativeRef : null,
      campaignId: typeof body.campaignId === 'string' ? body.campaignId : null,
      campaignLabel: typeof body.campaignLabel === 'string' ? body.campaignLabel : null,
      verdict: body.verdict as AdShareVerdict,
      comment: typeof body.comment === 'string' ? body.comment : undefined,
    });
    return NextResponse.json({ item }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    if (err instanceof AdShareFeedbackInvalidError) {
      return NextResponse.json(
        { error: 'invalid_feedback', reasons: err.reasons },
        { status: 400, headers: { 'cache-control': 'no-store' } },
      );
    }
    if (err instanceof AdStudioBriefNotFoundError) {
      return NextResponse.json(
        { error: 'invalid_feedback', reasons: ['brief_not_found'] },
        { status: 404, headers: { 'cache-control': 'no-store' } },
      );
    }
    if (err instanceof AdShareFeedbackLimitError) {
      return NextResponse.json(
        { error: 'feedback_limit_reached' },
        { status: 429, headers: { 'cache-control': 'no-store' } },
      );
    }
    throw err;
  }
}
