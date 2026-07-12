import 'server-only';
import { listOrchestrationRunsForProject } from './queries';
import { deriveCurrentFreshness, overallFreshnessAsOf, toOrchestrationRunView } from './orchestration-view';
import { computeTileFreshness, type TileFreshness } from './board-view';

/**
 * The one project-wide freshness figure every tile on a board shares (KAN-69,
 * plan `13 §E13.2`) — fetches the project's orchestration run history and
 * derives it via `deriveCurrentFreshness` -> `overallFreshnessAsOf` ->
 * `computeTileFreshness`. Shared by the board detail page
 * (`boards/[boardId]/page.tsx`) and the TV war-room rotation frame
 * (`api/tv-pairing/board/route.ts`) so both compute the exact same value the
 * exact same way, rather than each re-implementing the fetch -> derive
 * sequence.
 */
export async function resolveBoardFreshness(organizationId: string, projectId: string): Promise<TileFreshness | null> {
  const orchestrationRuns = await listOrchestrationRunsForProject(organizationId, projectId);
  const currentFreshness = deriveCurrentFreshness(orchestrationRuns.map(toOrchestrationRunView));
  return computeTileFreshness(overallFreshnessAsOf(currentFreshness?.freshness ?? []));
}
