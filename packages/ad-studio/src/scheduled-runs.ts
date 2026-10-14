import {
  AdStudioRunNotFoundError,
  getAdStudioRun,
  listAdStudioRunIndex,
  removeAdStudioRunIndex,
  type AdStudioRunModel,
} from '@growthos/firebase-orm-models';
import { ensureOrm } from './runtime';
import { advanceAdStudioAutopilot, type AdStudioAutopilotDeps } from './autopilot';
import { growthFailureCode } from './growth-pilot';

/** The most units one scheduled pass gives a single run, so one long video cannot starve the rest. */
export const AD_STUDIO_SCHEDULER_UNITS_PER_RUN = 12;

const FINISHED = new Set(['done', 'failed', 'cancelled']);

export interface AdStudioScheduledRun {
  runId: string;
  organizationId: string;
  projectId: string;
  units: number;
  /** `worked`; `waiting` (for the person to confirm the plan); `busy` (a tab is advancing it); `finished`; `gone`; or a failure code. */
  outcome: string;
}

/**
 * Keeps every autopilot run moving after the person closed the tab: walks the runs that have not
 * finished, oldest first, and advances each - on behalf of the person who started it, within the
 * project's daily limits like any other call - until the time budget is spent. A run waiting for its
 * plan to be confirmed is left alone; finished runs leave the index. Exporting is never done here.
 */
export async function runScheduledAdStudioRuns(ctx: {
  autopilot: AdStudioAutopilotDeps;
  budgetMs: number;
  clock?: () => number;
  /** The unit of work (tests); defaults to advanceAdStudioAutopilot. */
  step?: typeof advanceAdStudioAutopilot;
}): Promise<AdStudioScheduledRun[]> {
  await ensureOrm();
  const clock = ctx.clock ?? Date.now;
  const deadline = clock() + ctx.budgetMs;
  const step = ctx.step ?? advanceAdStudioAutopilot;
  const passes: AdStudioScheduledRun[] = [];
  for (const line of await listAdStudioRunIndex()) {
    if (clock() >= deadline) break;
    const ids = { organizationId: line.organization_id, projectId: line.project_id, briefId: line.brief_id, runId: line.run_id };
    const pass: AdStudioScheduledRun = { runId: line.run_id, organizationId: line.organization_id, projectId: line.project_id, units: 0, outcome: 'worked' };
    passes.push(pass);
    let run: AdStudioRunModel;
    try {
      run = await getAdStudioRun(ids.organizationId, ids.projectId, ids.briefId, ids.runId);
    } catch (error) {
      if (!(error instanceof AdStudioRunNotFoundError)) throw error;
      await removeAdStudioRunIndex(line.run_id);
      pass.outcome = 'gone';
      continue;
    }
    try {
      while (run.status === 'running' && pass.units < AD_STUDIO_SCHEDULER_UNITS_PER_RUN && clock() < deadline) {
        const before = run.last_advanced_on;
        run = await step({ ...ids, actorId: line.started_by }, ctx.autopilot);
        // Handed back untouched: someone else holds the lease (an open tab) - leave it to them.
        if (run.status === 'running' && run.last_advanced_on === before) {
          pass.outcome = 'busy';
          break;
        }
        pass.units += 1;
      }
    } catch (error) {
      pass.outcome = growthFailureCode(error);
    }
    if (FINISHED.has(run.status)) {
      await removeAdStudioRunIndex(line.run_id);
      pass.outcome = 'finished';
    } else if (run.status === 'awaiting_approval') {
      pass.outcome = 'waiting';
    }
  }
  return passes;
}
