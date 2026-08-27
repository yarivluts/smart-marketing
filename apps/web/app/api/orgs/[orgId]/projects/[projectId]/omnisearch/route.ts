import { NextResponse, type NextRequest } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { requireOrgMembership } from '@/lib/orgs/access';
import { buildOmniSearchCustomerItems, buildOmniSearchIndexForProject } from '@/lib/orgs/omnisearch';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * The KAN-85 global omnisearch index for one project — boards, active metric
 * definitions, segments, automation campaign targets, goals, and win rules.
 * Unlike most project-admin GET routes (which gate the whole endpoint on one
 * permission), this one degrades per result type instead of blanket-denying:
 * any active org member can call it, and each type is included only if the
 * caller holds the exact permission its own destination page already gates
 * on in `ProjectLayout` (`dashboards.read`/`dashboards.write` for boards,
 * `metrics.write` for metrics, `dashboards.write` for segments, goals, and
 * win rules, `automation.execute` for campaigns, `ingest.write` for
 * customers — the same permission the KAN-108 Customers page itself gates
 * on) — so a search result never links somewhere the caller couldn't
 * otherwise reach via the nav, but a `viewer` still gets a working (if
 * narrower) search instead of a 403.
 *
 * A `?q=` query param switches this into customer-search mode (KAN-116):
 * unlike every other result type, customers can't be eagerly listed in full
 * for client-side ranking (see `OMNI_SEARCH_RESULT_TYPES`'s own doc
 * comment), so a non-empty `q` returns only the live KAN-108 substring-search
 * matches for that query instead of the static index — the caller (the
 * omnisearch palette) already has the static index cached from its initial
 * fetch and re-queries this endpoint with `q` as the user types.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
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
  const canSearchCustomers = can(bindings, principal, 'ingest.write', { orgId });
  const query = request.nextUrl.searchParams.get('q');

  try {
    if (query && query.trim().length > 0) {
      const items = await buildOmniSearchCustomerItems(orgId, projectId, query, canSearchCustomers);
      return NextResponse.json({ items });
    }

    const items = await buildOmniSearchIndexForProject(orgId, projectId, {
      canSearchBoards: canManageBoards || can(bindings, principal, 'dashboards.read', { orgId }),
      canSearchMetrics: can(bindings, principal, 'metrics.write', { orgId }),
      canSearchSegments: canManageBoards,
      canSearchCampaigns: can(bindings, principal, 'automation.execute', { orgId }),
      canSearchGoals: canManageBoards,
      canSearchWinRules: canManageBoards,
    });
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
