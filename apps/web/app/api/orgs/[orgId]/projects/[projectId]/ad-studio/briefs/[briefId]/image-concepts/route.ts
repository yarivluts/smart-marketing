import { NextResponse, type NextRequest } from 'next/server';
import { saveAdStudioImageConcepts } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { parseImageConcepts } from '@/lib/ad-studio/parse';
import { briefImagesPayload } from '@/lib/ad-studio/images-payload';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Saves a person's edit of the brief's image ad ideas (what each picture shows, its headline, its
 * placements). Rendered images stay; a changed idea makes its images read as out of date. 400 with
 * every broken rule. Gated on `ai.use`.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ concepts?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const concepts = parseImageConcepts(parsed.body?.concepts);
  if (!concepts) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    await saveAdStudioImageConcepts({ organizationId: orgId, projectId, briefId, concepts });
    return NextResponse.json(await briefImagesPayload(orgId, projectId, briefId));
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
