import { NextResponse, type NextRequest } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { requireOrgMembership } from '@/lib/orgs/access';
import { buildOmniSearchIndexForProject } from '@/lib/orgs/omnisearch';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * The KAN-85 global omnisearch index for one project — boards, active metric
 * definitions, segments, and automation campaign targets. Unlike most
 * project-admin GET routes (which gate the whole endpoint on one permission),
 * this one degrades per result type instead of blanket-denying: any active
 * org member can call it, and each type is included only if the caller holds
 * the exact permission its own destination page already gates on in
 * `ProjectLayout` (`dashboards.read`/`dashboards.write` for boards,
 * `metrics.write` for metrics, `dashboards.write` for segments,
 * `automation.execute` for campaigns) — so a search result never links
 * somewhere the caller couldn't otherwise reach via the nav, but a `viewer`
 * still gets a working (if narrower) search instead of a 403.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;

  const { user, error } = await requireOrgMembership(orgId);
  if (error) {
    return error;
  }

  // `getServerSession`/`resolveOrgSessionContext` are both React `cache()`-memoized per request
  // (see their own doc comments), so re-deriving `bindings` here doesn't re-fetch anything
  // `requireOrgMembership` didn't already fetch — it's the only way to get the raw role bindings
  // this route needs for its own per-result-type `can()` checks, since `requireOrgMembership`
  // itself only returns the caller's `UserModel`.
  const session = await getServerSession();
  if (!session) {
    // Unreachable: `requireOrgMembership` above already required a session to succeed.
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { bindings } = await resolveOrgSessionContext(session);

  const principal = { type: 'user' as const, id: user.id };
  const canManageBoards = can(bindings, principal, 'dashboards.write', { orgId });

  try {
    const items = await buildOmniSearchIndexForProject(orgId, projectId, {
      canSearchBoards: canManageBoards || can(bindings, principal, 'dashboards.read', { orgId }),
      canSearchMetrics: can(bindings, principal, 'metrics.write', { orgId }),
      canSearchSegments: canManageBoards,
      canSearchCampaigns: can(bindings, principal, 'automation.execute', { orgId }),
    });
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
