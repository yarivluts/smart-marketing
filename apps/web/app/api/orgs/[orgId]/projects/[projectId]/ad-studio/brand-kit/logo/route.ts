import { NextResponse, type NextRequest } from 'next/server';
import { getAdStudioBrandKit } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { AD_STUDIO_MAX_LOGO_BYTES, AdStudioBrandLogoError, removeAdStudioBrandLogo, resolveAdStudioMediaStorage, saveAdStudioBrandLogo } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

export const dynamic = 'force-dynamic';

/** The project's brand logo, for the ad previews. The path comes from the brand kit, never the request. Gated on `ai.use`. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    const { logo } = await getAdStudioBrandKit(orgId, projectId);
    if (!logo) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return await streamAdStudioMedia(resolveAdStudioMediaStorage(), logo.path, request.headers.get('range'), logo.mimeType);
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/** Uploads the brand logo (PNG or JPEG, at most 2MB) as multipart `file`. Part of the brand kit: `project.configure`. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) return error;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (file.size > AD_STUDIO_MAX_LOGO_BYTES) return NextResponse.json({ error: 'invalid_logo', code: 'image_too_large' }, { status: 413 });
  try {
    const brandKit = await saveAdStudioBrandLogo({ organizationId: orgId, projectId, actorId: user.id, bytes: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ hasLogo: Boolean(brandKit.logo) }, { status: 201 });
  } catch (err) {
    if (err instanceof AdStudioBrandLogoError) return NextResponse.json({ error: 'invalid_logo', code: err.code }, { status: err.code === 'image_too_large' ? 413 : 400 });
    return adStudioErrorResponse(err);
  }
}

/** Removes the brand logo. `project.configure`. */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) return error;
  try {
    await removeAdStudioBrandLogo({ organizationId: orgId, projectId, actorId: user.id });
    return NextResponse.json({ hasLogo: false });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
