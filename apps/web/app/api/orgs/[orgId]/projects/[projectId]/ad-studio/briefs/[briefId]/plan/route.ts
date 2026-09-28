import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { toAdStudioBriefView } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { resolveAdStudioLlm, planAdStudioBrief } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Runs the brief's deep analysis (KAN-230): reads the landing page, the measured results in the
 * environment picked in the project shell, the project's campaigns and Google Ads keyword volumes,
 * then asks the text model for a plan that cites them, and stores it on the brief. Counts one call
 * toward the project's daily AI text limit. Gated on `ai.use`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const llm = resolveAdStudioLlm();
  if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    const { selected } = await resolveSelectedEnvironment(orgId, projectId);
    const brief = await planAdStudioBrief({
      organizationId: orgId,
      projectId,
      briefId,
      actorId: user.id,
      llm,
      environment: selected ? { id: selected.id, name: selected.name } : null,
    });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
