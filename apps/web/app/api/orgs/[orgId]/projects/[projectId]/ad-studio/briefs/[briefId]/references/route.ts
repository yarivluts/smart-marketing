import { NextResponse, type NextRequest } from 'next/server';
import { AD_STUDIO_MAX_REFERENCE_BYTES } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import {
  addUploadedReference,
  drawReferenceIllustration,
  listBriefReferences,
  resolveAdStudioImageGenerator,
  resolveAdStudioMediaStorage,
  toAdStudioReferenceView,
  type AdStudioImageAspectRatio,
} from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

export const dynamic = 'force-dynamic';

const ASPECT_RATIOS: readonly AdStudioImageAspectRatio[] = ['16:9', '9:16', '1:1', '4:5'];

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The ad's reference images (KAN-243) - app screenshots and AI illustrations that
 * scenes hand to the video model - and which ways of adding one this deployment offers. Gated on `ai.use`.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    const references = await listBriefReferences({ organizationId: orgId, projectId, briefId });
    return NextResponse.json({ references, illustration: resolveAdStudioImageGenerator() !== null });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/**
 * Adds a reference image. A multipart form with `file` uploads one (PNG or JPEG, checked by its
 * bytes); a JSON body with `source: "illustration"` draws one with the image model (counts toward
 * the daily image limit). Every image
 * needs a `label`; `description` says what it shows and goes into the scene prompt.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const ctx = { organizationId: orgId, projectId, briefId, actorId: user.id };
  try {
    if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      const form = await request.formData().catch(() => null);
      const file = form?.get('file');
      if (!form || !(file instanceof Blob)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
      if (file.size > AD_STUDIO_MAX_REFERENCE_BYTES) return NextResponse.json({ error: 'reference_request', code: 'image_too_large' }, { status: 413 });
      const reference = await addUploadedReference({ ...ctx, label: text(form.get('label')), description: text(form.get('description')), bytes: Buffer.from(await file.arrayBuffer()) });
      return NextResponse.json({ reference: toAdStudioReferenceView(reference) }, { status: 201 });
    }
    const parsed = await parseJsonBody<Record<string, unknown>>(request);
    if (parsed.error) return parsed.error;
    const body = parsed.body ?? {};
    const described = { label: text(body.label), description: text(body.description) };
    if (body.source === 'illustration') {
      const prompt = text(body.prompt).trim();
      const aspectRatio = ASPECT_RATIOS.find((ratio) => ratio === body.aspectRatio) ?? '16:9';
      if (!prompt) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
      const reference = await drawReferenceIllustration({ ...ctx, ...described, prompt, aspectRatio }, { images: resolveAdStudioImageGenerator(), storage: resolveAdStudioMediaStorage() });
      return NextResponse.json({ reference: toAdStudioReferenceView(reference) }, { status: 201 });
    }
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
