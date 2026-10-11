import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createGoal,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  ensureUserForFirebaseSession,
  getGoal,
  GoalNotFoundError,
  listAuditLogEntriesForOrg,
  registerMetricDefinition,
  setGoalStatus,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for the EasySign-audit goal pause/resume (J-05). */

beforeAll(async () => {
  await connectToFirestoreEmulator('goal-status-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setupGoal(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerMetricDefinition({
    organizationId: organization.id,
    projectId: project.id,
    name: 'lp_conversions',
    definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_landing_page_performance', column: 'conversions', timeColumn: 'activity_date', filters: [] } },
    dimensions: [],
    createdByUserId: owner.id,
  });
  const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
  const goal = await createGoal({
    organizationId: organization.id,
    projectId: project.id,
    name: 'Lift landing page conversion',
    metricName: 'lp_conversions',
    direction: 'maximize',
    targetValue: 8,
    startDate: '2026-08-17',
    deadline: '2026-09-30',
    rhythm: 'even',
    ownerPersonId: person.id,
    createdByUserId: owner.id,
  });
  return { owner, organization, project, goal };
}

describe('setGoalStatus', () => {
  it('pauses and resumes a goal, persisting the status and auditing each real transition (a no-op repeat is not audited)', async () => {
    const { owner, organization, project, goal } = await setupGoal('Goal Status Org');
    expect(goal.status).toBeUndefined();

    const paused = await setGoalStatus(organization.id, project.id, goal.id, 'paused', owner.id);
    expect(paused.status).toBe('paused');
    expect((await getGoal(organization.id, project.id, goal.id))?.status).toBe('paused');

    const stillPaused = await setGoalStatus(organization.id, project.id, goal.id, 'paused', owner.id);
    expect(stillPaused.status).toBe('paused');

    const resumed = await setGoalStatus(organization.id, project.id, goal.id, 'active', owner.id);
    expect(resumed.status).toBe('active');

    const audit = await listAuditLogEntriesForOrg(organization.id);
    expect(audit.filter((entry) => entry.action === 'goal.pause')).toHaveLength(1);
    expect(audit.filter((entry) => entry.action === 'goal.resume')).toHaveLength(1);
  });

  it('throws GoalNotFoundError for a goal outside the project', async () => {
    const { owner, organization, project } = await setupGoal('Goal Status Missing Org');
    await expect(setGoalStatus(organization.id, project.id, 'does-not-exist', 'paused', owner.id)).rejects.toBeInstanceOf(GoalNotFoundError);
  });
});
