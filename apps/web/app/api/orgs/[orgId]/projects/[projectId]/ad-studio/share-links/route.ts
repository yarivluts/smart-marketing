import { NextResponse, type NextRequest } from 'next/server';
import {
  AdShareFeedbackInvalidError,
  AdShareLinkInvalidError,
  createAdShareLink,
  listAdShareLinks,
  updateAdShareFeedbackStatus,
} from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** The project's client share links (never their tokens). Sharing outside the team is `project.configure`. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    return NextResponse.json({ links: await listAdShareLinks(orgId, projectId) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/**
 * Makes a read-only link to the project's ads for the client: `briefIds` null for every ad, or a
 * list; `expiresInDays` 7, 30 or 90; an optional `label`. The token is in this response only.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) return error;
  const parsed = await parseJsonBody<{
    briefIds?: unknown;
    label?: unknown;
    expiresInDays?: unknown;
    includeResults?: unknown;
    allowFeedback?: unknown;
    includeDrafts?: unknown;
    revisionNumber?: unknown;
    revisionNote?: unknown;
    supersedesLinkId?: unknown;
    markFeedbackSentIds?: unknown;
  }>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  const briefIds = body.briefIds ?? null;
  if (briefIds !== null && !(Array.isArray(briefIds) && briefIds.every((id) => typeof id === 'string'))) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (body.label !== undefined && typeof body.label !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (body.expiresInDays !== undefined && typeof body.expiresInDays !== 'number') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const markFeedbackSentIds = Array.isArray(body.markFeedbackSentIds)
    ? body.markFeedbackSentIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  try {
    await ensureFirestoreOrm();
    const created = await createAdShareLink({
      organizationId: orgId,
      projectId,
      briefIds: briefIds as string[] | null,
      label: body.label as string | undefined,
      expiresInDays: body.expiresInDays as number | undefined,
      ...(typeof body.includeResults === 'boolean' ? { includeResults: body.includeResults } : {}),
      ...(typeof body.allowFeedback === 'boolean' ? { allowFeedback: body.allowFeedback } : {}),
      ...(typeof body.includeDrafts === 'boolean' ? { includeDrafts: body.includeDrafts } : {}),
      ...(typeof body.revisionNumber === 'number' ? { revisionNumber: body.revisionNumber } : {}),
      ...(body.revisionNote !== undefined ? { revisionNote: body.revisionNote as string | null } : {}),
      ...(body.supersedesLinkId !== undefined ? { supersedesLinkId: body.supersedesLinkId as string | null } : {}),
      actorId: user.id,
    });
    if (markFeedbackSentIds.length > 0) {
      await updateAdShareFeedbackStatus({
        organizationId: orgId,
        projectId,
        feedbackIds: markFeedbackSentIds,
        status: 'sent_to_client',
      });
    }
    return NextResponse.json(created, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    if (err instanceof AdShareLinkInvalidError || err instanceof AdShareFeedbackInvalidError) {
      return NextResponse.json({ error: 'invalid_share_link', reasons: err.reasons }, { status: 400 });
    }
    return adStudioErrorResponse(err);
  }
}
