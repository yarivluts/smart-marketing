import { NextResponse, type NextRequest } from 'next/server';
import { AdStudioBrandKitInvalidError, getAdStudioBrandKit, setAdStudioBrandKit } from '@growthos/firebase-orm-models';
import { parseAdStudioBrandKit } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** The project's brand kit, for anyone who can use the studio. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  await ensureFirestoreOrm();
  return NextResponse.json({ brandKit: await getAdStudioBrandKit(orgId, projectId) });
}

/**
 * Saves the project's brand kit - name, tone of voice, words to avoid, colours - which every Ad
 * Studio prompt then follows. The customer's own brand, so `project.configure`. Audited.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) return error;
  const parsed = await parseJsonBody<{ brandKit?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const kit = parseAdStudioBrandKit(parsed.body?.brandKit);
  if (!kit) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const brandKit = await setAdStudioBrandKit({ organizationId: orgId, projectId, kit, actorId: user.id });
    return NextResponse.json({ brandKit });
  } catch (err) {
    if (err instanceof AdStudioBrandKitInvalidError) return NextResponse.json({ error: 'invalid_brand_kit', issues: err.issues }, { status: 400 });
    return adStudioErrorResponse(err);
  }
}
