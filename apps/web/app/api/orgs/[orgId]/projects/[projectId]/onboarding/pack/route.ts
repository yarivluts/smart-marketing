import { NextResponse, type NextRequest } from 'next/server';
import { InvalidOnboardingSelectionError, isOnboardingPackKey, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { selectOnboardingMetricPack } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toOnboardingStateView } from '@/lib/orgs/onboarding-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** The wizard's "pick a vertical/metric pack" step (plan `10 §2.6` step 1): installs the chosen built-in pack (registering its manifest first if needed) and provisions its metrics + starter boards, or records `custom` to skip installing anything. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ packKey?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { packKey } = parsed.body;
  if (typeof packKey !== 'string' || !isOnboardingPackKey(packKey)) {
    return NextResponse.json({ error: 'invalid_pack_key' }, { status: 400 });
  }

  try {
    const state = await selectOnboardingMetricPack({ organizationId: orgId, projectId, userId: user.id, packKey });
    return NextResponse.json({ state: toOnboardingStateView(state) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidOnboardingSelectionError) {
      return NextResponse.json({ error: 'invalid_pack_key' }, { status: 400 });
    }
    throw err;
  }
}
