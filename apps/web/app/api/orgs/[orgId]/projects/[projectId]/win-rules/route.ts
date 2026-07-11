import { NextResponse, type NextRequest } from 'next/server';
import { InvalidWinRuleError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { createWinRule } from '@/lib/orgs/mutations';
import { listWinRulesForProject } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseCreateWinRuleRequestBody } from '@/lib/orgs/parse-win-rule-fields';
import { toWinRuleSummaryView } from '@/lib/orgs/win-rule-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists every win rule in a project (KAN-65), newest-first — gated on `dashboards.write`, reusing the boards/goals feature's permission (see this story's PR description for why a dedicated `wins.manage` permission is out of scope). */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    const rules = await listWinRulesForProject(orgId, projectId);
    return NextResponse.json({ winRules: rules.map(toWinRuleSummaryView) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/** Creates a win rule (KAN-65, E12.2): an event pattern that fires a win, e.g. "first_charge" (no filters) or "order > 100" (`properties.amount > 100`). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseCreateWinRuleRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const rule = await createWinRule({
      organizationId: orgId,
      projectId,
      name: parsed.name,
      schemaName: parsed.schemaName,
      filters: parsed.filters,
      createdByUserId: user.id,
    });
    return NextResponse.json({ winRule: toWinRuleSummaryView(rule) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidWinRuleError) {
      return NextResponse.json({ error: 'invalid_win_rule', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
