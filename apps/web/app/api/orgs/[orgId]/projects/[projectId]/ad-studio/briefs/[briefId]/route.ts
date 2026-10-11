import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { deleteAdStudioBrief, toAdStudioBriefView, updateAdStudioBriefDetails } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { parseBriefInput } from '@/lib/ad-studio/parse';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/** Changes a brief's details (name, objective, product, landing page, frame, language, length). Gated on `ai.use`. */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (parsed.error) return parsed.error;
  try {
    const brief = await updateAdStudioBriefDetails({ organizationId: orgId, projectId, briefId, input: parseBriefInput(parsed.body ?? {}) });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/** Deletes a brief and its script (audited). Gated on `ai.use`. */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await deleteAdStudioBrief({ organizationId: orgId, projectId, briefId, actorId: user.id });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
