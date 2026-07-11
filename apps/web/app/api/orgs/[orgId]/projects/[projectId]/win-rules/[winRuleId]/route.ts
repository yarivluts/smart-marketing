import { NextResponse, type NextRequest } from 'next/server';
import { InvalidWinRuleError, WinRuleNotFoundError } from '@growthos/firebase-orm-models';
import { deleteWinRule, updateWinRule } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseUpdateWinRuleRequestBody } from '@/lib/orgs/parse-win-rule-fields';
import { toWinRuleSummaryView } from '@/lib/orgs/win-rule-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; winRuleId: string }>;
}

/** Updates a win rule's name/filters/active flag (KAN-65) — a full replace of whichever fields are present in the body, the same "current = only" shape `PATCH .../boards/[boardId]` uses. */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, winRuleId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseUpdateWinRuleRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const rule = await updateWinRule({
      organizationId: orgId,
      projectId,
      winRuleId,
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.filters !== undefined ? { filters: parsed.filters } : {}),
      ...(parsed.active !== undefined ? { active: parsed.active } : {}),
      updatedByUserId: user.id,
    });
    return NextResponse.json({ winRule: toWinRuleSummaryView(rule) });
  } catch (err) {
    if (err instanceof WinRuleNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidWinRuleError) {
      return NextResponse.json({ error: 'invalid_win_rule', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}

/** Deletes a win rule outright (see `deleteWinRule`'s own doc comment for why past wins it already fired are unaffected). */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, winRuleId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    await deleteWinRule(orgId, projectId, winRuleId, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof WinRuleNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
