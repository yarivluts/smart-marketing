import { NextResponse, type NextRequest } from 'next/server';
import { updateAdStudioReference } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { removeBriefReference, toAdStudioReferenceView } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; referenceId: string }>;
}

/** Renames a reference image or changes what it says it shows. Gated on `ai.use`. */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, referenceId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ label?: unknown; description?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const label = parsed.body?.label;
  const description = parsed.body?.description;
  if (typeof label !== 'string' || typeof description !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const reference = await updateAdStudioReference({ organizationId: orgId, projectId, briefId, referenceId, label, description });
    return NextResponse.json({ reference: toAdStudioReferenceView(reference) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/** Deletes a reference image, detaches it from every scene and removes its file. Gated on `ai.use`. */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, referenceId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await removeBriefReference({ organizationId: orgId, projectId, briefId, referenceId });
    return NextResponse.json({ deleted: referenceId });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
