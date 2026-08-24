import 'server-only';
import type { OmniSearchItem } from '@growthos/shared';
import {
  listAutomationTargetStatesForProject,
  listBoardsForProject,
  listMetricDefinitionsForProject,
  listSegmentsForProject,
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
}

/**
 * Builds the KAN-85 global omnisearch index for one project: boards, active
 * metric definitions (superseded versions are excluded — a search result
 * should only ever land on the metric family's current definition), segments,
 * and automation campaign targets. Each list is fetched only if the caller
 * holds the matching permission, so a lower-privileged caller never pays for
 * (or receives) data they can't see.
 */
export async function buildOmniSearchIndexForProject(
  organizationId: string,
  projectId: string,
  permissions: OmniSearchPermissions,
): Promise<OmniSearchItem[]> {
  const base = `/orgs/${organizationId}/projects/${projectId}`;

  const [boards, metricDefs, segments, campaigns] = await Promise.all([
    permissions.canSearchBoards ? listBoardsForProject(organizationId, projectId) : Promise.resolve([]),
    permissions.canSearchMetrics ? listMetricDefinitionsForProject(organizationId, projectId) : Promise.resolve([]),
    permissions.canSearchSegments ? listSegmentsForProject(organizationId, projectId) : Promise.resolve([]),
    permissions.canSearchCampaigns ? listAutomationTargetStatesForProject(organizationId, projectId) : Promise.resolve([]),
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

  return items;
}
