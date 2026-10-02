import { NextResponse, type NextRequest } from 'next/server';
import { saveAdStudioMetaTargeting } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toAdStudioBriefView } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { parseMetaTargeting } from '@/lib/ad-studio/targeting';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/** Saves the Meta audience the ad is planned for; `targeting: null` clears it. 400 with every broken rule. Gated on `ai.use`. */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ targeting?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const raw = parsed.body?.targeting;
  const targeting = raw === null ? null : parseMetaTargeting(raw);
  if (targeting === undefined) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const brief = await saveAdStudioMetaTargeting({ organizationId: orgId, projectId, briefId, targeting });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
