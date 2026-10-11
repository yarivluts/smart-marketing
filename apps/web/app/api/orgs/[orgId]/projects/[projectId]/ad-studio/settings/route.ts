import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { setAdStudioSettings } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';

function parseVideoQa(value: unknown): { enabled: boolean; retries: number } {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return { enabled: raw.enabled as boolean, retries: typeof raw.retries === 'number' ? raw.retries : Number.NaN };
}

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Sets the project's daily Ad Studio limits (AI text calls, seconds of video, images) and the AI quality check of clips. Audited. Gated on `project.configure`. */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) return error;
  const parsed = await parseJsonBody<{ dailyTextGenerations?: unknown; dailyVideoSeconds?: unknown; dailyImages?: unknown; videoQa?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number.NaN);
  try {
    const settings = await setAdStudioSettings({
      organizationId: orgId,
      projectId,
      dailyTextGenerations: toNumber(parsed.body?.dailyTextGenerations),
      dailyVideoSeconds: toNumber(parsed.body?.dailyVideoSeconds),
      // Optional so an older client keeps the image limit as it is.
      ...(parsed.body?.dailyImages !== undefined ? { dailyImages: toNumber(parsed.body.dailyImages) } : {}),
      // Optional too: an older client keeps the quality-check setting. A malformed value is refused by the service.
      ...(parsed.body?.videoQa !== undefined ? { videoQa: parseVideoQa(parsed.body.videoQa) } : {}),
      actorId: user.id,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
