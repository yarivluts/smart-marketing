import { NextResponse, type NextRequest } from 'next/server';
import { AdShareProposalNotFoundError } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { decideClientProposal, resolveAdStudioLlm } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; proposalId: string }>;
}

/** Approves & applies (`decision: 'approve'`) or declines (`decision: 'decline'`) an AI client-request proposal. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, proposalId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  await ensureFirestoreOrm();

  const parsed = await parseJsonBody<{ decision?: unknown; regenerate?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  if (body.decision !== 'approve' && body.decision !== 'decline') {
    return NextResponse.json({ error: 'invalid_decision' }, { status: 400 });
  }

  try {
    const result = await decideClientProposal({
      organizationId: orgId,
      projectId,
      proposalId,
      actorId: user.id,
      decision: body.decision,
      regenerate: typeof body.regenerate === 'boolean' ? body.regenerate : true,
      llm: resolveAdStudioLlm(),
    });
    return NextResponse.json(
      {
        proposal: result.proposal,
        appliedBriefId: result.appliedBriefId,
        runId: result.run?.id ?? null,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    if (err instanceof AdShareProposalNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return adStudioErrorResponse(err);
  }
}
