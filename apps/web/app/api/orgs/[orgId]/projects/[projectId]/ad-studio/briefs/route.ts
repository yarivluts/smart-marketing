import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { createAdStudioBrief, listAdStudioBriefs, toAdStudioBriefView } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { parseBriefInput } from '@/lib/ad-studio/parse';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** The project's Ad Studio briefs, newest first. Gated on `ai.use`. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    const briefs = await listAdStudioBriefs(orgId, projectId);
    return NextResponse.json({ briefs: briefs.map(toAdStudioBriefView) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/** Starts a new ad from a brief. Gated on `ai.use`. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (parsed.error) return parsed.error;
  try {
    const brief = await createAdStudioBrief({ organizationId: orgId, projectId, input: parseBriefInput(parsed.body ?? {}), createdByUserId: user.id });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) }, { status: 201 });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
