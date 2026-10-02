import { NextResponse, type NextRequest } from 'next/server';
import { getAdStudioBrief } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { searchAdStudioMetaInterests } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/** Meta interests matching `?q=`, with audience sizes, named in the ad's language. Read only. Gated on `ai.use`. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    const brief = await getAdStudioBrief(orgId, projectId, briefId);
    const query = request.nextUrl.searchParams.get('q') ?? '';
    return NextResponse.json({ result: await searchAdStudioMetaInterests({ organizationId: orgId, projectId, query, language: brief.language }) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
