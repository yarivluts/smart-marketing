import type { NextRequest } from 'next/server';
import { getAdStudioBrandKit } from '@growthos/firebase-orm-models';
import { resolveShareLink, SHARED_MEDIA_CACHE_CONTROL, sharedNotFound } from '@/lib/ad-studio/share';
import { resolveAdStudioMediaStorage } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';

interface RouteParams {
  params: Promise<{ token: string }>;
}

export const dynamic = 'force-dynamic';

/** The shared project's brand logo, for the client's ad previews. No sign-in: the token is the key. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { token } = await params;
  const link = await resolveShareLink(token);
  if (!link) return sharedNotFound();
  const { logo } = await getAdStudioBrandKit(link.organizationId, link.projectId);
  if (!logo) return sharedNotFound();
  return streamAdStudioMedia(resolveAdStudioMediaStorage(), logo.path, request.headers.get('range'), logo.mimeType, SHARED_MEDIA_CACHE_CONTROL);
}
