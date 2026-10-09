import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { FirestoreOrmRepository } from '@arbel/firebase-orm';
import { GoalModel } from '../models/goal.model';
import { queryGoalProgress } from './goal.service';

beforeAll(() => {
  const repo = FirestoreOrmRepository as unknown as {
    globalFirestores: Record<string, unknown>;
    DEFAULT_KEY_NAME: string;
  };
  repo.globalFirestores[repo.DEFAULT_KEY_NAME] = {};
});

describe('queryGoalProgress forecast integration (KAN-308)', () => {
  it('returns valid forecast structure when goal has not yet started', async () => {
    const goal = new GoalModel();
    goal.id = 'goal-future-1';
    goal.name = 'Q4 Signups';
    goal.metric_name = 'signups';
    goal.direction = 'maximize';
    goal.target_value = 10000;
    goal.range_min = null;
    goal.range_max = null;
    goal.start_date = '2026-11-01';
    goal.deadline = '2026-11-30';
    goal.rhythm = 'even';
    goal.owner_person_id = 'person-1';

    const outcome = await queryGoalProgress({
      organizationId: 'org-test',
      projectId: 'proj-test',
      goal,
      asOfDate: '2026-10-15', // Before start_date
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.actualValue).toBe(0);
      expect(outcome.progress.progressRatio).toBe(0);
      expect(outcome.forecast).toBeDefined();
      expect(outcome.forecast?.simulatedRuns).toBe(1000);
      expect(outcome.forecast?.trajectorySpline.length).toBe(8);
      expect(outcome.forecast?.milestones.length).toBe(4);
    }
  });
});
