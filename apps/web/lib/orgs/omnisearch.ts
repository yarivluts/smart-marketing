import 'server-only';
import type { OmniSearchItem } from '@growthos/shared';
import type { AppShellNavItem } from '@/components/orgs/app-shell';
import {
  listAutomationTargetStatesForProject,
  listBoardsForProject,
  listGoalsForProject,
  listMetricDefinitionsForProject,
  listSegmentsForProject,
  listWinRulesForProject,
  searchProjectCustomers,
} from '@/lib/orgs/queries';

/**
 * Which omnisearch result types the caller is allowed to see, mirroring the
 * exact permission each type's own destination page already gates on in
 * `ProjectLayout` — a search result must never link somewhere the caller
 * couldn't otherwise reach via the nav.
 */
export interface OmniSearchPermissions {
  canSearchBoards: boolean;
  canSearchMetrics: boolean;
  canSearchSegments: boolean;
  canSearchCampaigns: boolean;
  canSearchGoals: boolean;
  canSearchWinRules: boolean;
}

/**
 * Builds the KAN-85 global omnisearch index for one project: boards, active
 * metric definitions (superseded versions are excluded — a search result
 * should only ever land on the metric family's current definition), segments,
 * automation campaign targets, goals, and win rules. Each list is fetched
 * only if the caller holds the matching permission, so a lower-privileged
 * caller never pays for (or receives) data they can't see.
 */
export async function buildOmniSearchIndexForProject(
  organizationId: string,
  projectId: string,
  permissions: OmniSearchPermissions,
): Promise<OmniSearchItem[]> {
  const base = `/orgs/${organizationId}/projects/${projectId}`;

  const [boards, metricDefs, segments, campaigns, goals, winRules] = await Promise.all([
    permissions.canSearchBoards ? listBoardsForProject(organizationId, projectId) : Promise.resolve([]),
    permissions.canSearchMetrics ? listMetricDefinitionsForProject(organizationId, projectId) : Promise.resolve([]),
    permissions.canSearchSegments ? listSegmentsForProject(organizationId, projectId) : Promise.resolve([]),
    permissions.canSearchCampaigns ? listAutomationTargetStatesForProject(organizationId, projectId) : Promise.resolve([]),
    permissions.canSearchGoals ? listGoalsForProject(organizationId, projectId) : Promise.resolve([]),
    permissions.canSearchWinRules ? listWinRulesForProject(organizationId, projectId) : Promise.resolve([]),
  ]);

  const items: OmniSearchItem[] = [];

  for (const board of boards) {
    items.push({ id: board.id, type: 'board', label: board.name, href: `${base}/boards/${board.id}` });
  }

  for (const metricDef of metricDefs) {
    if (metricDef.status !== 'active') {
      continue;
    }
    items.push({ id: metricDef.id, type: 'metric', label: metricDef.name, href: `${base}/metric-defs` });
  }

  for (const segment of segments) {
    items.push({ id: segment.id, type: 'segment', label: segment.name, href: `${base}/segments` });
  }

  for (const target of campaigns) {
    items.push({
      id: target.id,
      type: 'campaign',
      label: target.label,
      description: target.target_type,
      href: `${base}/automation`,
    });
  }

  for (const goal of goals) {
    items.push({ id: goal.id, type: 'goal', label: goal.name, href: `${base}/goals/${goal.id}` });
  }

  for (const winRule of winRules) {
    items.push({ id: winRule.id, type: 'win_rule', label: winRule.name, href: `${base}/win-rules` });
  }

  return items;
}

/** Capped well below the Customer 360 page's own `DEFAULT_CUSTOMER_SEARCH_LIMIT` (20) — the palette shows a handful of jump-to targets, not a full results page. */
const OMNI_SEARCH_CUSTOMER_RESULT_LIMIT = 5;

/**
 * The query-time customer half of the omnisearch index (KAN-116). Every other result type is small
 * enough to eagerly list in full via `buildOmniSearchIndexForProject` and rank client-side as the
 * user types; "every landed customer" is neither small nor rankable without a query (see
 * `OMNI_SEARCH_RESULT_TYPES`'s own doc comment), so this instead runs the exact KAN-108
 * `searchProjectCustomers` substring search fresh on each call, gated on the same `ingest.write`
 * permission the Customers page itself requires. A degraded warehouse outcome (not configured,
 * quota exceeded, or a query error) returns no customer results rather than surfacing an error in a
 * "jump to X" palette — the same silent-degrade posture the static index already applies to a
 * permission the caller lacks.
 */
export async function buildOmniSearchCustomerItems(
  organizationId: string,
  projectId: string,
  query: string,
  canSearchCustomers: boolean,
): Promise<OmniSearchItem[]> {
  const trimmedQuery = query.trim();
  if (!canSearchCustomers || trimmedQuery.length === 0) {
    return [];
  }

  const outcome = await searchProjectCustomers(organizationId, projectId, trimmedQuery, { limit: OMNI_SEARCH_CUSTOMER_RESULT_LIMIT });
  if (!outcome.ok) {
    return [];
  }

  const base = `/orgs/${organizationId}/projects/${projectId}`;
  return outcome.results.map((result) => ({
    id: `${result.schemaName}:${result.entityId}`,
    type: 'customer' as const,
    label: result.entityId,
    description: result.schemaName,
    href: `${base}/customers?q=${encodeURIComponent(result.entityId)}&schema=${encodeURIComponent(result.schemaName)}`,
  }));
}

/**
 * Turns `ProjectLayout`'s own nav items into "jump to this page" omnisearch
 * results — the deferred follow-up from restoring the pre-redesign nav
 * (see `layout.tsx`'s doc comment and PROGRESS.md's 2026-09-01 entry): those
 * items became reachable from the sidebar again, but were still invisible to
 * Cmd/Ctrl-K, since the static index above only ever covered listed
 * *entities* (a specific board, a specific goal), never the destination
 * *pages* themselves (e.g. jumping straight to the Cost guardrails page, or
 * to the Segments page when the project has zero segments yet). Every nav
 * item passed in is already translated and permission-filtered by the caller
 * (`ProjectLayout` computes the exact same `can()` checks its own sidebar
 * renders against), so this is a pure label/href passthrough — the page's
 * own destination doubles as its `id`. De-dupes by href (first occurrence
 * wins) so a caller that accidentally passes the same nav item twice (e.g.
 * concatenating overlapping section arrays) can never produce two results
 * with the same `id`, which would collide as the same React list key.
 */
export function buildOmniSearchPageShortcuts(navItems: readonly AppShellNavItem[]): OmniSearchItem[] {
  const seenHrefs = new Set<string>();
  const items: OmniSearchItem[] = [];
  for (const item of navItems) {
    if (seenHrefs.has(item.href)) {
      continue;
    }
    seenHrefs.add(item.href);
    items.push({ id: item.href, type: 'page', label: item.label, href: item.href });
  }
  return items;
}
