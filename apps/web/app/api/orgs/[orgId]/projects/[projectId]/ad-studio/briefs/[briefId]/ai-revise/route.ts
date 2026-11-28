import { NextResponse, type NextRequest } from 'next/server';
import { getAdStudioBrief } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { startAdStudioAutopilot, toAdStudioRunView } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

const VALID_TARGETS = new Set(['video', 'search', 'image', 'images']);
const MAX_INSTRUCTION_CHARS = 600;

/**
 * Starts a targeted AI revision run on a specific creative (`video`, `search`, `images`, or
 * `image` with `conceptId`), pulling missing project/brand/brief details from the target site
 * first, revising the script/ad/concept, and re-making only what changed. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;

  const parsed = await parseJsonBody<{
    target?: unknown;
    instruction?: unknown;
    conceptId?: unknown;
    siteUrl?: unknown;
  }>(request);
  if (parsed.error) return parsed.error;

  const target = typeof parsed.body?.target === 'string' ? parsed.body.target : '';
  if (!VALID_TARGETS.has(target)) {
    return NextResponse.json({ error: 'invalid_target' }, { status: 400 });
  }
  const instruction = typeof parsed.body?.instruction === 'string' ? parsed.body.instruction.trim() : '';
  if (!instruction || instruction.length > MAX_INSTRUCTION_CHARS) {
    return NextResponse.json({ error: 'invalid_instruction' }, { status: 400 });
  }
  const conceptId = typeof parsed.body?.conceptId === 'string' ? parsed.body.conceptId.trim() : '';
  if (target === 'image' && !conceptId) {
    return NextResponse.json({ error: 'concept_required' }, { status: 400 });
  }
  const siteUrl = typeof parsed.body?.siteUrl === 'string' && parsed.body.siteUrl.trim() ? parsed.body.siteUrl.trim() : null;

  try {
    await ensureFirestoreOrm();
    const { selected } = await resolveSelectedEnvironment(orgId, projectId);
    let imageFormats: ('square' | 'portrait' | 'story' | 'landscape')[] = ['square', 'portrait'];
    if (target === 'image') {
      const brief = await getAdStudioBrief(orgId, projectId, briefId);
      const concept = (brief.image_concepts ?? []).find((c) => c.id === conceptId);
      if (concept?.formats?.length) {
        imageFormats = [...concept.formats];
      }
    }
    const run = await startAdStudioAutopilot({
      organizationId: orgId,
      projectId,
      briefId,
      actorId: user.id,
      options: {
        target: target as 'video' | 'search' | 'image' | 'images',
        targetConceptId: target === 'image' ? conceptId : null,
        siteEnrich: true,
        plan: false,
        images: target === 'image' || target === 'images',
        imageFormats,
        video: target === 'video',
        search: target === 'search',
        confirmPlan: false,
        instruction,
        siteUrl,
        notifyAlways: true,
        environmentId: selected?.id ?? null,
      },
    });
    return NextResponse.json({ run: toAdStudioRunView(run) }, { status: 201 });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
