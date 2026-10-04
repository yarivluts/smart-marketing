import { NextResponse, type NextRequest } from 'next/server';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import {
  verifyStreamForRequirement,
  STREAM_REQUIREMENT_MATCHERS,
} from '@/lib/projects/setup-stream-verifier';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

interface VerifyStreamRequestBody {
  requirementId?: unknown;
  lookbackHours?: unknown;
  action?: unknown;
  simulateTestEvent?: unknown;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<VerifyStreamRequestBody>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { requirementId, lookbackHours, action, simulateTestEvent } = parsed.body;
  if (typeof requirementId !== 'string' || !requirementId.trim()) {
    return NextResponse.json({ error: 'requirement_id_required' }, { status: 400 });
  }

  const reqId = requirementId.trim();
  const hours = typeof lookbackHours === 'number' && lookbackHours > 0 ? lookbackHours : 24;
  const act = action === 'unverify' ? 'unverify' : action === 'check' ? 'check' : 'verify';
  const shouldSimulate = Boolean(simulateTestEvent);

  try {
    const result = await verifyStreamForRequirement({
      organizationId: orgId,
      projectId,
      requirementId: reqId,
      lookbackHours: hours,
      action: act,
      simulateTestEvent: shouldSimulate,
      actorUserId: user.id,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'verification_failed';
    const status = message === 'Project not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  const { searchParams } = new URL(request.url);
  const requirementId = searchParams.get('requirementId');
  const lookbackHours = Number(searchParams.get('lookbackHours') || '24');

  try {
    if (requirementId && requirementId.trim()) {
      const result = await verifyStreamForRequirement({
        organizationId: orgId,
        projectId,
        requirementId: requirementId.trim(),
        lookbackHours: Number.isFinite(lookbackHours) && lookbackHours > 0 ? lookbackHours : 24,
        action: 'check',
        actorUserId: user.id,
      });
      return NextResponse.json(result);
    }

    // Check all known stream requirements
    const results: Record<string, unknown> = {};
    for (const reqKey of Object.keys(STREAM_REQUIREMENT_MATCHERS)) {
      results[reqKey] = await verifyStreamForRequirement({
        organizationId: orgId,
        projectId,
        requirementId: reqKey,
        lookbackHours: Number.isFinite(lookbackHours) && lookbackHours > 0 ? lookbackHours : 24,
        action: 'check',
        actorUserId: user.id,
      });
    }

    return NextResponse.json({
      success: true,
      lookbackHours,
      streams: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'check_failed';
    const status = message === 'Project not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
