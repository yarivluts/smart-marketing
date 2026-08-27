import 'server-only';
import type { OmniSearchItem } from '@growthos/shared';
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
