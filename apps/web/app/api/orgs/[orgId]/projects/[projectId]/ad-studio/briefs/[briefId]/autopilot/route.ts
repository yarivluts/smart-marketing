import { NextResponse, type NextRequest } from 'next/server';
import { getLatestAdStudioRun } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { startAdStudioAutopilot, toAdStudioRunView } from '@/lib/ad-studio/engine';
import { parseAutopilotOptions } from '@/lib/ad-studio/parse';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/** The brief's latest autopilot run, or null. Gated on `ai.use`. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    const run = await getLatestAdStudioRun(orgId, projectId, briefId);
    return NextResponse.json({ run: run ? toAdStudioRunView(run) : null });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/**
 * Starts the autopilot for a brief: plan -> script -> image ideas -> images -> video clips ->
 * assembled video, each only if missing. The page then advances it step by step. The plan reads
 * results from the environment the viewer has selected unless the request names one. Gated on
 * `ai.use` (every step is an AI call inside the project's daily limits); exporting is not part of it.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ options?: unknown }>(request);
  if (parsed.error) return parsed.error;
  try {
    const options = parseAutopilotOptions(parsed.body?.options);
    if (options.environmentId === undefined) {
      const { selected } = await resolveSelectedEnvironment(orgId, projectId);
      options.environmentId = selected?.id ?? null;
    }
    const run = await startAdStudioAutopilot({ organizationId: orgId, projectId, briefId, actorId: user.id, options });
    return NextResponse.json({ run: toAdStudioRunView(run) }, { status: 201 });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
