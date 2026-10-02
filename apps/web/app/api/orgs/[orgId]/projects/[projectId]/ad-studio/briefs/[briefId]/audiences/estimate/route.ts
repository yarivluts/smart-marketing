import { NextResponse, type NextRequest } from 'next/server';
import { metaTargetingIssues, normalizeMetaTargeting } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { parseMetaTargeting } from '@/lib/ad-studio/targeting';
import { estimateAdStudioMetaReach } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/** Meta's estimate of the monthly reach of `targeting` (not saved). 400 with the broken rules. Gated on `ai.use`. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ targeting?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const targeting = parseMetaTargeting(parsed.body?.targeting);
  if (!targeting) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const issues = metaTargetingIssues(normalizeMetaTargeting(targeting));
  if (issues.length) return NextResponse.json({ error: 'invalid_targeting', issues: issues.map((code) => ({ code })) }, { status: 400 });
  try {
    return NextResponse.json({ result: await estimateAdStudioMetaReach({ organizationId: orgId, projectId, targeting }) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
