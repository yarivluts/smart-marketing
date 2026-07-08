import { NextResponse, type NextRequest } from 'next/server';
import { InvalidCostQuotaError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { setProjectCostQuota } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Sets a project's KAN-39 cost-guardrail quota (daily query limit + labels).
 * Gated on `project.manage` — the same per-project admin-config permission
 * `project_admin` already holds, and the closest existing fit in the
 * catalog: this is an admin-configurable *resource limit* for the project,
 * not specifically a metrics-authoring action (`metrics.write`) or an
 * org-billing one (`billing.manage`, withheld from `project_admin`).
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ dailyQueryLimit?: unknown; labels?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { dailyQueryLimit, labels } = parsed.body;
  if (typeof dailyQueryLimit !== 'number') {
    return NextResponse.json({ error: 'daily_query_limit_required' }, { status: 400 });
  }
  if (typeof labels !== 'object' || labels === null || Object.values(labels).some((value) => typeof value !== 'string')) {
    return NextResponse.json({ error: 'invalid_labels' }, { status: 400 });
  }

  try {
    const quota = await setProjectCostQuota({
      organizationId: orgId,
      projectId,
      dailyQueryLimit,
      labels: labels as Record<string, string>,
      setByUserId: user.id,
    });
    return NextResponse.json({ dailyQueryLimit: quota.daily_query_limit, labels: quota.labels, setAt: quota.set_at }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidCostQuotaError) {
      return NextResponse.json({ error: 'invalid_daily_query_limit' }, { status: 400 });
    }
    throw err;
  }
}
