import { NextResponse, type NextRequest } from 'next/server';
import { isOnboardingSourceConnectionMethod, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { markOnboardingSourceConnected } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toOnboardingStateView } from '@/lib/orgs/onboarding-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * The wizard's "connect a first source" step (plan `10 §2.6` step 2). Records *how* the source was
 * connected — the actual connection (a plugin install via `POST .../plugins`, or an `ingest.write`
 * key mint via `POST .../keys`) happens through those existing routes, called separately by the
 * wizard's UI before this one.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ method?: unknown; pluginId?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { method, pluginId } = parsed.body;
  if (typeof method !== 'string' || !isOnboardingSourceConnectionMethod(method)) {
    return NextResponse.json({ error: 'invalid_method' }, { status: 400 });
  }
  if (pluginId !== undefined && typeof pluginId !== 'string') {
    return NextResponse.json({ error: 'invalid_plugin_id' }, { status: 400 });
  }

  try {
    const state = await markOnboardingSourceConnected({
      organizationId: orgId,
      projectId,
      userId: user.id,
      method,
      ...(pluginId !== undefined ? { pluginId } : {}),
    });
    return NextResponse.json({ state: toOnboardingStateView(state) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
