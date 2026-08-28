import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createGoal,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  deleteGoal,
  ensureUserForFirebaseSession,
  getGoal,
  GoalNotFoundError,
  InMemoryMetricQueryResultCache,
  InvalidGoalError,
  KNOWN_UNBUILT_WAREHOUSE_TABLES,
  listAuditLogEntriesForOrg,
  listGoalsForProject,
  ProjectNotFoundError,
  queryGoalProgress,
  registerMetricDefinition,
  setProjectCostQuota,
  updateGoal,
  updateGoalDefinition,
  type WarehouseQueryExecutor,
  type WarehouseRow,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-64's goal CRUD + `queryGoalProgress` — the Firestore-resolving layer the goals admin surface and detail page sit on top of. */

beforeAll(async () => {
  await connectToFirestoreEmulator('goal-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

/**
 * A "signups"-named metric against an unrelated real table — these fixtures
 * exist purely to exercise `queryGoalProgress`'s own executor/cache/quota
 * plumbing, independent of whichever table the SaaS pack's actual `signups`
 * metric targets.
 */
async function registerSignups(organizationId: string, projectId: string, createdByUserId: string) {
  return registerMetricDefinition({
    organizationId,
    projectId,
    name: 'signups',
    definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_landing_page_performance', timeColumn: 'date', filters: [] } },
    dimensions: [],
    createdByUserId,
  });
}

async function registerCostPerSignup(organizationId: string, projectId: string, createdByUserId: string) {
  return registerMetricDefinition({
    organizationId,
    projectId,
    name: 'cost_per_signup',
    definition: { kind: 'aggregation', aggregation: { function: 'avg', table: 'fact_landing_page_performance', column: 'cost_per_signup', timeColumn: 'date', filters: [] } },
    dimensions: [],
    createdByUserId,
  });
}

class FakeWarehouseQueryExecutor implements WarehouseQueryExecutor {
  public callCount = 0;
  constructor(private readonly rows: WarehouseRow[]) {}
  execute(): Promise<WarehouseRow[]> {
    this.callCount += 1;
    return Promise.resolve(this.rows);
  }
}

describe('createGoal', () => {
  it('creates a maximize goal with a target value', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Create Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });

    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Q3 signups',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1000,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    expect(goal.name).toBe('Q3 signups');
    expect(goal.direction).toBe('maximize');
    expect(goal.target_value).toBe(1000);
    expect(goal.range_min).toBeNull();
    expect(goal.range_max).toBeNull();
    expect(goal.owner_person_id).toBe(person.id);
    expect(goal.created_by).toBe(owner.id);
  });

  it('creates a range goal with null target_value', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Range Org');
    await registerCostPerSignup(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Sam Rep', createdByUserId: owner.id });

    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Healthy CAC band',
      metricName: 'cost_per_signup',
      direction: 'range',
      rangeMin: 20,
      rangeMax: 40,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'work_week_weekend',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    expect(goal.direction).toBe('range');
    expect(goal.target_value).toBeNull();
    expect(goal.range_min).toBe(20);
    expect(goal.range_max).toBe(40);
    expect(goal.rhythm).toBe('work_week_weekend');
  });

  it('audits the create as actor type "api_key" when createdByActorType is set (KAN-76 MCP create_goal tool path)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Audit Api Key Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });

    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Q3 signups',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1000,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: 'key-abc123',
      createdByActorType: 'api_key',
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.target_id === goal.id);
    expect(entry?.actor_type).toBe('api_key');
    expect(entry?.actor_id).toBe('key-abc123');
  });

  it('rejects a project that does not belong to this org', async () => {
    const { owner, organization } = await setupOrgWithProject('Goal Bad Project Org');
    await expect(
      createGoal({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        name: 'X',
        metricName: 'signups',
        direction: 'maximize',
        targetValue: 10,
        startDate: '2026-01-01',
        deadline: '2026-02-01',
        rhythm: 'even',
        ownerPersonId: 'nope',
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('collects every validation failure into one InvalidGoalError rather than failing fast', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Invalid Org');

    let caught: unknown;
    try {
      await createGoal({
        organizationId: organization.id,
        projectId: project.id,
        name: '   ',
        metricName: 'does_not_exist',
        direction: 'bogus',
        startDate: '2026-09-30',
        deadline: '2026-07-01',
        rhythm: 'bogus',
        ownerPersonId: 'does-not-exist',
        createdByUserId: owner.id,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidGoalError);
    const reasons = (caught as InstanceType<typeof InvalidGoalError>).reasons;
    expect(reasons.length).toBeGreaterThanOrEqual(5);
    expect(reasons.some((reason) => reason.includes('non-empty name'))).toBe(true);
    expect(reasons.some((reason) => reason.includes('Unknown goal direction'))).toBe(true);
    expect(reasons.some((reason) => reason.includes('Unknown goal rhythm'))).toBe(true);
    expect(reasons.some((reason) => reason.includes('before its deadline'))).toBe(true);
    expect(reasons.some((reason) => reason.includes('not registered'))).toBe(true);
    expect(reasons.some((reason) => reason.includes('does not exist in this organization'))).toBe(true);
  });

  it('rejects a maximize/minimize goal missing a finite target value', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Missing Target Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });

    await expect(
      createGoal({
        organizationId: organization.id,
        projectId: project.id,
        name: 'No target',
        metricName: 'signups',
        direction: 'maximize',
        startDate: '2026-01-01',
        deadline: '2026-02-01',
        rhythm: 'even',
        ownerPersonId: person.id,
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidGoalError);
  });

  it('rejects a range goal with rangeMin >= rangeMax', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Bad Range Org');
    await registerCostPerSignup(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });

    await expect(
      createGoal({
        organizationId: organization.id,
        projectId: project.id,
        name: 'Bad range',
        metricName: 'cost_per_signup',
        direction: 'range',
        rangeMin: 40,
        rangeMax: 20,
        startDate: '2026-01-01',
        deadline: '2026-02-01',
        rhythm: 'even',
        ownerPersonId: person.id,
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidGoalError);
  });
});

describe('listGoalsForProject / getGoal', () => {
  it('lists a project’s goals deadline-sorted (soonest-first) and isolates from a sibling project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal List Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
    await registerSignups(organization.id, project.id, owner.id);
    await registerSignups(organization.id, otherProject.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });

    const makeGoal = (projectId: string, name: string, deadline: string) =>
      createGoal({
        organizationId: organization.id,
        projectId,
        name,
        metricName: 'signups',
        direction: 'maximize',
        targetValue: 100,
        startDate: '2026-01-01',
        deadline,
        rhythm: 'even',
        ownerPersonId: person.id,
        createdByUserId: owner.id,
      });

    await makeGoal(project.id, 'Later', '2026-12-31');
    await makeGoal(project.id, 'Sooner', '2026-03-01');
    await makeGoal(otherProject.id, 'Sibling', '2026-01-15');

    const goals = await listGoalsForProject(organization.id, project.id);
    expect(goals.map((goal) => goal.name)).toEqual(['Sooner', 'Later']);
  });

  it('returns null for a goal id that does not exist, or belongs to a different org/project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Get Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Goal',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 100,
      startDate: '2026-01-01',
      deadline: '2026-02-01',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });
    const { organization: otherOrg, project: otherProject } = await setupOrgWithProject('Goal Get Other Org');

    expect(await getGoal(organization.id, project.id, 'does-not-exist')).toBeNull();
    expect(await getGoal(otherOrg.id, project.id, goal.id)).toBeNull();
    expect(await getGoal(organization.id, otherProject.id, goal.id)).toBeNull();
    expect((await getGoal(organization.id, project.id, goal.id))?.id).toBe(goal.id);
  });
});

describe('deleteGoal', () => {
  it('deletes a goal so it is no longer gettable or listed', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Delete Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Goal',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 100,
      startDate: '2026-01-01',
      deadline: '2026-02-01',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    await deleteGoal(organization.id, project.id, goal.id, owner.id);

    expect(await getGoal(organization.id, project.id, goal.id)).toBeNull();
    expect(await listGoalsForProject(organization.id, project.id)).toEqual([]);
  });

  it('throws GoalNotFoundError for a goal that does not belong to this org+project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Delete Missing Org');
    const { organization: otherOrg, project: otherProject } = await setupOrgWithProject('Goal Delete Other Org');
    await registerSignups(otherOrg.id, otherProject.id, owner.id);
    const person = await createOrgPerson({ organizationId: otherOrg.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: otherOrg.id,
      projectId: otherProject.id,
      name: 'Goal',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 100,
      startDate: '2026-01-01',
      deadline: '2026-02-01',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    await expect(deleteGoal(organization.id, project.id, goal.id, owner.id)).rejects.toBeInstanceOf(GoalNotFoundError);
  });
});

describe('updateGoal', () => {
  it('updates a maximize goal’s target value and audits before/after', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Update Target Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Q3 signups',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1000,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    const updated = await updateGoal({
      organizationId: organization.id,
      projectId: project.id,
      goalId: goal.id,
      targetValue: 1500,
      updatedByUserId: owner.id,
    });

    expect(updated.target_value).toBe(1500);
    expect(updated.updated_by).toBe(owner.id);

    const reloaded = await getGoal(organization.id, project.id, goal.id);
    expect(reloaded?.target_value).toBe(1500);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.target_id === goal.id && candidate.action === 'goal.update');
    expect(entry).toBeDefined();
  });

  it('updates a range goal’s rangeMin/rangeMax together', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Update Range Org');
    await registerCostPerSignup(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Healthy CAC band',
      metricName: 'cost_per_signup',
      direction: 'range',
      rangeMin: 20,
      rangeMax: 40,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    const updated = await updateGoal({
      organizationId: organization.id,
      projectId: project.id,
      goalId: goal.id,
      rangeMin: 25,
      rangeMax: 45,
      updatedByUserId: owner.id,
    });

    expect(updated.range_min).toBe(25);
    expect(updated.range_max).toBe(45);
  });

  it('rejects setting targetValue on a range goal', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Update Wrong Direction Org');
    await registerCostPerSignup(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Healthy CAC band',
      metricName: 'cost_per_signup',
      direction: 'range',
      rangeMin: 20,
      rangeMax: 40,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    await expect(
      updateGoal({ organizationId: organization.id, projectId: project.id, goalId: goal.id, targetValue: 999, updatedByUserId: owner.id }),
    ).rejects.toBeInstanceOf(InvalidGoalError);
  });

  it('rejects setting rangeMin/rangeMax on a maximize goal', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Update Wrong Direction 2 Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Q3 signups',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1000,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    await expect(
      updateGoal({ organizationId: organization.id, projectId: project.id, goalId: goal.id, rangeMin: 10, rangeMax: 20, updatedByUserId: owner.id }),
    ).rejects.toBeInstanceOf(InvalidGoalError);
  });

  it('rejects a range update where rangeMin >= rangeMax', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Update Bad Range Org');
    await registerCostPerSignup(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Healthy CAC band',
      metricName: 'cost_per_signup',
      direction: 'range',
      rangeMin: 20,
      rangeMax: 40,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    await expect(
      updateGoal({ organizationId: organization.id, projectId: project.id, goalId: goal.id, rangeMin: 50, rangeMax: 30, updatedByUserId: owner.id }),
    ).rejects.toBeInstanceOf(InvalidGoalError);
  });

  it('throws GoalNotFoundError for a goal that does not belong to this org+project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Update Missing Org');
    await expect(
      updateGoal({ organizationId: organization.id, projectId: project.id, goalId: 'does-not-exist', targetValue: 100, updatedByUserId: owner.id }),
    ).rejects.toBeInstanceOf(GoalNotFoundError);
  });
});

describe('updateGoalDefinition', () => {
  it('replaces every field of a maximize goal and reloads with the new values', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Definition Update Org');
    await registerSignups(organization.id, project.id, owner.id);
    await registerCostPerSignup(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const newOwner = await createOrgPerson({ organizationId: organization.id, name: 'New Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Q3 sgnups', // typo, corrected below
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1000,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    const updated = await updateGoalDefinition({
      organizationId: organization.id,
      projectId: project.id,
      goalId: goal.id,
      name: 'Q3 signups',
      metricName: 'cost_per_signup',
      direction: 'minimize',
      targetValue: 40,
      startDate: '2026-08-01',
      deadline: '2026-10-31',
      rhythm: 'work_week_weekend',
      ownerPersonId: newOwner.id,
      updatedByUserId: owner.id,
    });

    expect(updated.name).toBe('Q3 signups');
    expect(updated.metric_name).toBe('cost_per_signup');
    expect(updated.direction).toBe('minimize');
    expect(updated.target_value).toBe(40);
    expect(updated.range_min).toBeNull();
    expect(updated.range_max).toBeNull();
    expect(updated.start_date).toBe('2026-08-01');
    expect(updated.deadline).toBe('2026-10-31');
    expect(updated.rhythm).toBe('work_week_weekend');
    expect(updated.owner_person_id).toBe(newOwner.id);
    expect(updated.updated_by).toBe(owner.id);

    const reloaded = await getGoal(organization.id, project.id, goal.id);
    expect(reloaded).toMatchObject({
      name: 'Q3 signups',
      metric_name: 'cost_per_signup',
      direction: 'minimize',
      target_value: 40,
      owner_person_id: newOwner.id,
    });
    // Structural/identity fields never change.
    expect(reloaded?.organization_id).toBe(organization.id);
    expect(reloaded?.project_id).toBe(project.id);
    expect(reloaded?.created_by).toBe(owner.id);
  });

  it('switches a maximize goal to a range goal, clearing target_value and setting range_min/range_max', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Definition Switch Direction Org');
    await registerCostPerSignup(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Signup cost ceiling',
      metricName: 'cost_per_signup',
      direction: 'minimize',
      targetValue: 50,
      startDate: '2026-01-01',
      deadline: '2026-01-31',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    const updated = await updateGoalDefinition({
      organizationId: organization.id,
      projectId: project.id,
      goalId: goal.id,
      name: 'Signup cost band',
      metricName: 'cost_per_signup',
      direction: 'range',
      rangeMin: 20,
      rangeMax: 40,
      startDate: '2026-01-01',
      deadline: '2026-01-31',
      rhythm: 'even',
      ownerPersonId: person.id,
      updatedByUserId: owner.id,
    });

    expect(updated.direction).toBe('range');
    expect(updated.target_value).toBeNull();
    expect(updated.range_min).toBe(20);
    expect(updated.range_max).toBe(40);
  });

  it('records an audit-log entry with before/after values', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Definition Audit Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Q3 signups',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1000,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    await updateGoalDefinition({
      organizationId: organization.id,
      projectId: project.id,
      goalId: goal.id,
      name: 'Q3 signups (revised)',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1200,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
      updatedByUserId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.target_id === goal.id && candidate.action === 'goal.update_definition');
    expect(entry).toBeDefined();
    expect(entry?.before).toMatchObject({ name: 'Q3 signups', target_value: 1000 });
    expect(entry?.after).toMatchObject({ name: 'Q3 signups (revised)', target_value: 1200 });
  });

  it('collects every validation reason and leaves the goal unchanged (unknown metric, unknown owner, bad dates)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Definition Invalid Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Q3 signups',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1000,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    let caught: InvalidGoalError | undefined;
    try {
      await updateGoalDefinition({
        organizationId: organization.id,
        projectId: project.id,
        goalId: goal.id,
        name: '   ',
        metricName: 'does-not-exist',
        direction: 'maximize',
        targetValue: 1000,
        startDate: '2026-09-30',
        deadline: '2026-07-01', // before startDate
        rhythm: 'even',
        ownerPersonId: 'does-not-exist',
        updatedByUserId: owner.id,
      });
    } catch (error) {
      caught = error as InvalidGoalError;
    }
    expect(caught).toBeInstanceOf(InvalidGoalError);
    expect(caught?.reasons.length).toBeGreaterThanOrEqual(3);

    const reloaded = await getGoal(organization.id, project.id, goal.id);
    expect(reloaded?.name).toBe('Q3 signups');
    expect(reloaded?.metric_name).toBe('signups');
  });

  it('throws GoalNotFoundError for a goal that does not belong to this org+project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Definition Update Missing Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    await expect(
      updateGoalDefinition({
        organizationId: organization.id,
        projectId: project.id,
        goalId: 'does-not-exist',
        name: 'Q3 signups',
        metricName: 'signups',
        direction: 'maximize',
        targetValue: 1000,
        startDate: '2026-07-01',
        deadline: '2026-09-30',
        rhythm: 'even',
        ownerPersonId: person.id,
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(GoalNotFoundError);
  });
});

describe('queryGoalProgress', () => {
  it('sums the metric series into actualValue and computes on_track pace for a maximize goal', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Query Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Signups goal',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 100,
      startDate: '2026-01-01',
      deadline: '2026-01-11', // 10-day even-rhythm window
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    const rows: WarehouseRow[] = [
      { bucket_date: '2026-01-01', signups: 30 },
      { bucket_date: '2026-01-02', signups: 30 },
    ];
    const executor = new FakeWarehouseQueryExecutor(rows);

    const outcome = await queryGoalProgress({
      organizationId: organization.id,
      projectId: project.id,
      goal,
      executor,
      cache: new InMemoryMetricQueryResultCache(),
      asOfDate: '2026-01-06', // 5/10 days elapsed => expectedAtNow = 50
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected ok outcome');
    expect(outcome.actualValue).toBe(60);
    expect(outcome.progress.expectedAtNow).toBe(50);
    expect(outcome.progress.status).toBe('on_track');
    expect(executor.callCount).toBe(1);
  });

  it('pins the minimize-goal red/green AC end-to-end through the real service (signup cost)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Minimize Query Org');
    await registerCostPerSignup(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Signup cost ceiling',
      metricName: 'cost_per_signup',
      direction: 'minimize',
      targetValue: 50,
      startDate: '2026-01-01',
      deadline: '2026-01-31',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    const green = await queryGoalProgress({
      organizationId: organization.id,
      projectId: project.id,
      goal,
      executor: new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', cost_per_signup: 40 }]),
      cache: new InMemoryMetricQueryResultCache(),
      asOfDate: '2026-01-15',
    });
    expect(green.ok).toBe(true);
    if (!green.ok) throw new Error('expected ok outcome');
    expect(green.actualValue).toBe(40);
    expect(green.progress.status).toBe('on_track');
    expect(green.progress.isGoalMet).toBe(true);

    const red = await queryGoalProgress({
      organizationId: organization.id,
      projectId: project.id,
      goal,
      executor: new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', cost_per_signup: 65 }]),
      cache: new InMemoryMetricQueryResultCache(),
      asOfDate: '2026-01-15',
    });
    expect(red.ok).toBe(true);
    if (!red.ok) throw new Error('expected ok outcome');
    expect(red.actualValue).toBe(65);
    expect(red.progress.status).toBe('off_track');
    expect(red.progress.isGoalMet).toBe(false);
  });

  it('fits a trend over the queried day-grain series for a minimize goal\'s projectedFinalValue', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Minimize Trend Org');
    await registerCostPerSignup(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Signup cost ceiling (trending down)',
      metricName: 'cost_per_signup',
      direction: 'minimize',
      targetValue: 50,
      startDate: '2026-01-01',
      deadline: '2026-01-11', // 10-day even-rhythm window, matches the maximize test above
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    // bucket_date 2026-01-01 => elapsedFraction 0; 2026-01-06 => elapsedFraction
    // 0.5 (same 10-day window the maximize test above pins). Two points
    // (0, 60) and (0.5, 50) fit an exact linear trend (slope -20, intercept
    // 60), extrapolating to 40 at elapsedFraction 1 — below the target-value
    // fallback (a flat 110, the two rows' sum) the pre-trend v1 behavior
    // would have produced.
    const executor = new FakeWarehouseQueryExecutor([
      { bucket_date: '2026-01-01', cost_per_signup: 60 },
      { bucket_date: '2026-01-06', cost_per_signup: 50 },
    ]);

    const outcome = await queryGoalProgress({
      organizationId: organization.id,
      projectId: project.id,
      goal,
      executor,
      cache: new InMemoryMetricQueryResultCache(),
      asOfDate: '2026-01-06',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected ok outcome');
    expect(outcome.progress.projectedFinalValue).toBeCloseTo(40, 10);
  });

  it('degrades to a "warehouse not configured" outcome instead of throwing, using the default executor', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Query Unconfigured Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Goal',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 100,
      startDate: '2026-01-01',
      deadline: '2026-02-01',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    const outcome = await queryGoalProgress({
      organizationId: organization.id,
      projectId: project.id,
      goal,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "quota exceeded" outcome once the project’s daily quota is spent', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Query Quota Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Goal',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 100,
      startDate: '2026-01-01',
      deadline: '2026-02-01',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });

    const first = await queryGoalProgress({
      organizationId: organization.id,
      projectId: project.id,
      goal,
      executor: new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', signups: 1 }]),
      cache: new InMemoryMetricQueryResultCache(),
    });
    expect(first.ok).toBe(true);

    const second = await queryGoalProgress({
      organizationId: organization.id,
      projectId: project.id,
      goal,
      executor: new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', signups: 1 }]),
      cache: new InMemoryMetricQueryResultCache(),
    });
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toBe('quota_exceeded');
  });

  it('degrades to a "not yet backed" outcome for a metric targeting a known-unbuilt table, without touching the executor', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Query Unbuilt Table Org');
    // `KNOWN_UNBUILT_WAREHOUSE_TABLES` is empty today (everything it used to list, including
    // `fact_funnel_event` — see the next test — now has a real dbt core model, 2026-08-21 KAN-59
    // follow-up), so this test exercises the generic mechanism against a table added just for it.
    const fixtureOnlyUnbuiltTable = 'fixture_only_unbuilt_table_for_test';
    KNOWN_UNBUILT_WAREHOUSE_TABLES.add(fixtureOnlyUnbuiltTable);
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'real_signups',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: fixtureOnlyUnbuiltTable, timeColumn: 'ts', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Goal',
      metricName: 'real_signups',
      direction: 'maximize',
      targetValue: 100,
      startDate: '2026-01-01',
      deadline: '2026-02-01',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', real_signups: 1 }]);

    try {
      const outcome = await queryGoalProgress({
        organizationId: organization.id,
        projectId: project.id,
        goal,
        executor,
        cache: new InMemoryMetricQueryResultCache(),
      });

      expect(outcome.ok).toBe(false);
      expect(outcome.ok === false && outcome.reason).toBe('not_yet_backed');
      expect(executor.callCount).toBe(0);
    } finally {
      KNOWN_UNBUILT_WAREHOUSE_TABLES.delete(fixtureOnlyUnbuiltTable);
    }
  });

  it('succeeds for a goal against signups (fact_funnel_event) now that a real core model backs it (2026-08-21 KAN-59 follow-up)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Query Funnel Event Now Real Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'real_signups',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_funnel_event', timeColumn: 'ts', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Goal',
      metricName: 'real_signups',
      direction: 'maximize',
      targetValue: 100,
      startDate: '2026-01-01',
      deadline: '2026-02-01',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', real_signups: 1 }]);

    const outcome = await queryGoalProgress({
      organizationId: organization.id,
      projectId: project.id,
      goal,
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(true);
    expect(executor.callCount).toBe(1);
  });

  it('caps the queried window at the goal deadline even when asOfDate is past it', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Query Past Deadline Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Goal',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 100,
      startDate: '2026-01-01',
      deadline: '2026-01-10',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    class RecordingWarehouseQueryExecutor implements WarehouseQueryExecutor {
      public lastQuery: { sql: string; params: Record<string, unknown> } | undefined;
      execute(query: { sql: string; params: Record<string, unknown> }): Promise<WarehouseRow[]> {
        this.lastQuery = query;
        return Promise.resolve([{ bucket_date: '2026-01-01', signups: 100 }]);
      }
    }
    const executor = new RecordingWarehouseQueryExecutor();

    const outcome = await queryGoalProgress({
      organizationId: organization.id,
      projectId: project.id,
      goal,
      executor,
      cache: new InMemoryMetricQueryResultCache(),
      asOfDate: '2026-06-01', // long past the deadline
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected ok outcome');
    expect(outcome.progress.status).toBe('on_track');
    // The compiled query's time-end bind param must be clamped to the
    // goal's own deadline, not the far-future asOfDate passed in.
    expect(executor.lastQuery?.params.time_end_current).toBe('2026-01-10');
  });

  it('short-circuits to a 0-progress outcome without querying when the goal has not started yet', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Goal Query Not Started Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Future goal',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 100,
      startDate: '2026-08-01',
      deadline: '2026-12-01',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });

    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-08-01', signups: 999 }]);

    const outcome = await queryGoalProgress({
      organizationId: organization.id,
      projectId: project.id,
      goal,
      executor,
      cache: new InMemoryMetricQueryResultCache(),
      asOfDate: '2026-07-10', // before start_date
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected ok outcome');
    expect(outcome.actualValue).toBe(0);
    expect(outcome.progress.expectedAtNow).toBe(0);
    expect(outcome.progress.status).toBe('on_track');
    // Never reaches the warehouse — an inverted [start_date, asOfDate] range
    // would otherwise throw a `MetricCompilerError` (`deriveTimeWindows`).
    expect(executor.callCount).toBe(0);
  });
});
