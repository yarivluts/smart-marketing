import { NextResponse, type NextRequest } from 'next/server';
import { saveAdStudioNarrationMode } from '@growthos/firebase-orm-models';
import { isAdStudioNarrationMode, type AdStudioNarrationMode } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toAdStudioBriefView } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Sets who narrates the ad - `voiceover`, `on_camera`, `mixed`, or `null` for automatic - and applies
 * it to the saved script, so the clips of every scene whose speaker changed go out of date.
 * `presenter` names the one person on camera (for `on_camera`). 400 for anything else. Gated on `ai.use`.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ mode?: unknown; presenter?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const raw = parsed.body?.mode;
  if (raw !== null && !isAdStudioNarrationMode(raw)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const presenter = parsed.body?.presenter;
  if (presenter !== undefined && presenter !== null && typeof presenter !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const brief = await saveAdStudioNarrationMode({ organizationId: orgId, projectId, briefId, mode: raw as AdStudioNarrationMode | null, presenter: presenter ?? null });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
