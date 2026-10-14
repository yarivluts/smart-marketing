import { NextResponse, type NextRequest } from 'next/server';
import { decideGrowthProposal, getGrowthProposal } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { approveGrowthActivation, approveGrowthPublish, resolveAdStudioLlm, reviseGrowthProposal } from '@/lib/ad-studio/engine';
import { loadGrowthPilotPage } from '@/lib/growth-pilot/store';
import { growthPilotErrorResponse } from '@/lib/growth-pilot/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; proposalId: string }>;
}

// Publishing uploads each approved image to Meta and creates the ads: allow for a slow platform.
export const maxDuration = 300;

/**
 * The person's decision on a proposal: `{ action: 'approve' | 'reject' }`, or `{ action: 'revise',
 * request }` to have the AI change it (it comes back for a decision). Returns the page data.
 * Gated on `ai.use`; approving a `publish` (with `dailyBudget`) or an `activate` proposal acts on the
 * ad platform - publishing paused ads, then turning them on - and needs `automation.execute`.
 * Approvals and rejections are audited.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, proposalId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { action?: unknown; request?: unknown; dailyBudget?: unknown } | null;
  const action = body?.action;
  if (action !== 'approve' && action !== 'reject' && action !== 'revise') return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    if (action === 'revise') {
      const llm = resolveAdStudioLlm();
      if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
      await reviseGrowthProposal({ organizationId: orgId, projectId, actorId: user.id, llm, proposalId, request: typeof body?.request === 'string' ? body.request : '' });
    } else {
      const proposal = await getGrowthProposal(orgId, projectId, proposalId);
      if (action === 'approve' && (proposal.kind === 'publish' || proposal.kind === 'activate')) {
        const gate = await requireProjectPermission(orgId, projectId, 'automation.execute');
        if (gate.error) return gate.error;
        const llm = resolveAdStudioLlm();
        const ctx = { organizationId: orgId, projectId, actorId: user.id, llm: llm!, proposalId };
        if (proposal.kind === 'publish') await approveGrowthPublish({ ...ctx, ...(typeof body?.dailyBudget === 'number' ? { dailyBudget: body.dailyBudget } : {}) });
        else await approveGrowthActivation(ctx);
      } else {
        await decideGrowthProposal({ organizationId: orgId, projectId, proposalId, decision: action, actorId: user.id });
      }
    }
    return NextResponse.json(await loadGrowthPilotPage(orgId, projectId));
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}
