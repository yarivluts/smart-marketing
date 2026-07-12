import { NextResponse, type NextRequest } from 'next/server';
import { disengageAutomationKillSwitch, engageAutomationKillSwitch } from '@/lib/orgs/mutations';
import { getAutomationKillSwitchStatus } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/** The org's KAN-71 "pause all automation" kill switch state — per-tenant scope, see `AutomationKillSwitchEventModel`'s own doc comment for why not platform-wide too. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const status = await getAutomationKillSwitchStatus(orgId);
  return NextResponse.json(status);
}

/** Engages or disengages the org's automation kill switch. `{ engaged: true, reason }` engages it; `{ engaged: false }` disengages it. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ engaged?: unknown; reason?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { engaged, reason } = parsed.body;
  if (typeof engaged !== 'boolean') {
    return NextResponse.json({ error: 'engaged_required' }, { status: 400 });
  }

  if (engaged) {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: 'reason_required' }, { status: 400 });
    }
    const status = await engageAutomationKillSwitch({ organizationId: orgId, reason: reason.trim(), actorId: user.id });
    return NextResponse.json(status, { status: 201 });
  }

  const status = await disengageAutomationKillSwitch(orgId, user.id);
  return NextResponse.json(status, { status: 201 });
}
