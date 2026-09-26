import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  backfillBuiltinMetricUnits,
  createGoal,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  ensureLandingPagePackRegistered,
  ensureUserForFirebaseSession,
  evolveMetricDefinition,
  getActiveMetricDefinition,
  getMetricCatalogDetail,
  InvalidGoalError,
  InvalidMetricDefinitionError,
  listAuditLogEntriesForOrg,
  listMetricsCatalogForProject,
  MetricDefModel,
  registerMetricDefinition,
  resolveMetricDisplayUnits,
  updateGoal,
  updateGoalDefinition,
  GoalModel,
  type MetricDefinitionInput,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** KAN-213: metric units through registration, evolution, the catalog, pack installs, goals and the backfill. */

beforeAll(async () => {
  await connectToFirestoreEmulator('metric-units-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Units Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

const visitors: MetricDefinitionInput = {
  kind: 'aggregation',
  aggregation: { function: 'sum', table: 'fact_landing_page_performance', column: 'visitors', timeColumn: 'activity_date', filters: [] },
};

describe('metric unit on registration and evolution', () => {
  it('stores a declared unit, canonicalised, and returns it from the catalog and detail', async () => {
    const { owner, organization, project } = await setup();
    const metricDef = await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'lp_visitors',
      definition: visitors,
      dimensions: [],
      unit: 'count',
      createdByUserId: owner.id,
    });
    expect(metricDef.unit).toBe('count');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'spend_eur',
      definition: { kind: 'formula', formula: 'lp_visitors * 2' },
      dimensions: [],
      unit: 'currency:eur',
      createdByUserId: owner.id,
    });

    const catalog = await listMetricsCatalogForProject(organization.id, project.id);
    expect(catalog.find((entry) => entry.name === 'lp_visitors')?.unit).toBe('count');
    expect(catalog.find((entry) => entry.name === 'spend_eur')?.unit).toBe('currency:EUR');
    expect((await getMetricCatalogDetail(organization.id, project.id, 'spend_eur'))?.unit).toBe('currency:EUR');
  });

  it('leaves the unit absent when none is declared (a plain number, as before)', async () => {
    const { owner, organization, project } = await setup();
    await registerMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'lp_visitors', definition: visitors, dimensions: [], createdByUserId: owner.id });
    const detail = await getMetricCatalogDetail(organization.id, project.id, 'lp_visitors');
    expect(detail).not.toBeNull();
    expect(detail?.unit).toBeUndefined();
  });

  it('rejects an unknown unit with a reason naming the valid ones', async () => {
    const { owner, organization, project } = await setup();
    const attempt = registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'lp_visitors',
      definition: visitors,
      dimensions: [],
      unit: 'fraction',
      createdByUserId: owner.id,
    });
    await expect(attempt).rejects.toBeInstanceOf(InvalidMetricDefinitionError);
    await expect(attempt).rejects.toThrow(/Unknown metric unit "fraction"/);
  });

  it('carries the unit forward on an evolve that omits it, sets a new one, and clears it with null', async () => {
    const { owner, organization, project } = await setup();
    const base = { organizationId: organization.id, projectId: project.id, name: 'lp_visitors', definition: visitors, dimensions: [], createdByUserId: owner.id };
    await registerMetricDefinition({ ...base, unit: 'count' });

    const v2 = await evolveMetricDefinition(base);
    expect(v2.unit).toBe('count');
    const v3 = await evolveMetricDefinition({ ...base, unit: 'number' });
    expect(v3.unit).toBe('number');
    const v4 = await evolveMetricDefinition({ ...base, unit: null });
    expect(v4.unit).toBeUndefined();
    expect((await getActiveMetricDefinition(organization.id, project.id, 'lp_visitors'))?.version).toBe(4);
  });
});

describe('resolveMetricDisplayUnits', () => {
  it('resolves a bare currency to the project currency and an undeclared unit to a plain number', async () => {
    const { owner, organization, project } = await setup();
    project.currency = 'ILS';
    await project.save();
    const base = { organizationId: organization.id, projectId: project.id, dimensions: [] as string[], createdByUserId: owner.id };
    await registerMetricDefinition({ ...base, name: 'lp_visitors', definition: visitors });
    await registerMetricDefinition({ ...base, name: 'spend', definition: { kind: 'formula', formula: 'lp_visitors * 3' }, unit: 'currency' });
    await registerMetricDefinition({ ...base, name: 'spend_usd', definition: { kind: 'formula', formula: 'lp_visitors * 4' }, unit: 'currency:USD' });
    await registerMetricDefinition({ ...base, name: 'rate', definition: { kind: 'formula', formula: 'lp_visitors / lp_visitors' }, unit: 'ratio' });

    expect(await resolveMetricDisplayUnits(organization.id, project.id)).toEqual({
      lp_visitors: { kind: 'number' },
      spend: { kind: 'currency', currency: 'ILS' },
      spend_usd: { kind: 'currency', currency: 'USD' },
      rate: { kind: 'ratio' },
    });
  });
});

describe('built-in pack units', () => {
  it('registers the landing-page pack with lp_conversion_rate as a ratio and its inputs as counts', async () => {
    const { owner, organization, project } = await setup();
    await ensureLandingPagePackRegistered(organization.id, project.id, owner.id);
    const catalog = await listMetricsCatalogForProject(organization.id, project.id);
    const units = Object.fromEntries(catalog.map((entry) => [entry.name, entry.unit]));
    expect(units).toMatchObject({ lp_visitors: 'count', lp_conversions: 'count', lp_conversion_rate: 'ratio' });
  });
});

describe('goal targets are checked against the metric unit', () => {
  async function ratioGoalSetup() {
    const { owner, organization, project } = await setup();
    await ensureLandingPagePackRegistered(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Owner', createdByUserId: owner.id });
    const goalParams = {
      organizationId: organization.id,
      projectId: project.id,
      name: 'Lift landing page conversion to 8%',
      metricName: 'lp_conversion_rate',
      direction: 'maximize',
      startDate: '2026-09-01',
      deadline: '2026-12-31',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    };
    return { owner, organization, project, goalParams };
  }

  it('refuses a target of 8 on a 0-1 ratio, saying 0.08 is what 8% means', async () => {
    const { goalParams } = await ratioGoalSetup();
    const attempt = createGoal({ ...goalParams, targetValue: 8 });
    await expect(attempt).rejects.toBeInstanceOf(InvalidGoalError);
    await expect(attempt).rejects.toThrow(/ratio .* between 0 and 1\. For 8%, use 0\.08\./);
  });

  it('accepts the fraction, and refuses an out-of-range edit of it', async () => {
    const { owner, organization, project, goalParams } = await ratioGoalSetup();
    const goal = await createGoal({ ...goalParams, targetValue: 0.08 });
    expect(goal.target_value).toBe(0.08);

    await expect(updateGoal({ organizationId: organization.id, projectId: project.id, goalId: goal.id, targetValue: 12, updatedByUserId: owner.id })).rejects.toThrow(
      /For 12%, use 0\.12\./,
    );
    const edited = await updateGoal({ organizationId: organization.id, projectId: project.id, goalId: goal.id, targetValue: 0.12, updatedByUserId: owner.id });
    expect(edited.target_value).toBe(0.12);

    await expect(
      updateGoalDefinition({ ...goalParams, goalId: goal.id, direction: 'range', rangeMin: 0.05, rangeMax: 5, updatedByUserId: owner.id }),
    ).rejects.toThrow(/Range maximum 5 is outside/);
  });

  it('still accepts any target on a metric with no declared unit', async () => {
    const { owner, organization, project } = await setup();
    await registerMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'lp_visitors', definition: visitors, dimensions: [], createdByUserId: owner.id });
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Owner', createdByUserId: owner.id });
    const goal = await createGoal({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Visitors',
      metricName: 'lp_visitors',
      direction: 'maximize',
      targetValue: -3,
      startDate: '2026-09-01',
      deadline: '2026-12-31',
      rhythm: 'even',
      ownerPersonId: person.id,
      createdByUserId: owner.id,
    });
    expect(goal.target_value).toBe(-3);
  });

  it('does not rewrite, or refuse unrelated edits to, a goal saved out of range before units existed', async () => {
    const { owner, organization, project, goalParams } = await ratioGoalSetup();
    // A legacy goal written straight to Firestore, as it was before this validation existed.
    const legacy = new GoalModel();
    Object.assign(legacy, {
      organization_id: organization.id,
      project_id: project.id,
      name: goalParams.name,
      metric_name: 'lp_conversion_rate',
      direction: 'range',
      target_value: null,
      range_min: 5,
      range_max: 8,
      start_date: goalParams.startDate,
      deadline: goalParams.deadline,
      rhythm: 'even',
      owner_person_id: goalParams.ownerPersonId,
      created_by: owner.id,
      created_at: new Date().toISOString(),
      updated_by: owner.id,
      updated_at: new Date().toISOString(),
    });
    legacy.setPathParams({ organization_id: organization.id, project_id: project.id });
    await legacy.save();

    // Editing only the minimum validates only the minimum.
    const edited = await updateGoal({ organizationId: organization.id, projectId: project.id, goalId: legacy.id, rangeMin: 0.05, updatedByUserId: owner.id });
    expect(edited.range_min).toBe(0.05);
    expect(edited.range_max).toBe(8);
  });
});

describe('backfillBuiltinMetricUnits', () => {
  it('declares pack units on unit-less built-in metrics, skips customised ones, and is idempotent', async () => {
    const { owner, organization, project } = await setup();
    const base = { organizationId: organization.id, projectId: project.id, dimensions: [] as string[], createdByUserId: owner.id };
    // As registered before units existed: no unit on any of them.
    await registerMetricDefinition({ ...base, name: 'lp_visitors', definition: visitors });
    await registerMetricDefinition({
      ...base,
      name: 'lp_conversions',
      definition: {
        kind: 'aggregation',
        aggregation: { function: 'sum', table: 'fact_landing_page_performance', column: 'conversions', timeColumn: 'activity_date', filters: [] },
      },
    });
    await registerMetricDefinition({ ...base, name: 'lp_conversion_rate', definition: { kind: 'formula', formula: 'lp_conversions  /  lp_visitors' } });
    // A human rewrote this one to a percent scale - the pack's "ratio" would now be wrong.
    await registerMetricDefinition({ ...base, name: 'signups', definition: { kind: 'formula', formula: 'lp_conversions * 100' } });
    // Not a built-in name at all.
    await registerMetricDefinition({ ...base, name: 'my_metric', definition: visitors });

    const dryRun = await backfillBuiltinMetricUnits({ organizationId: organization.id, projectId: project.id, dryRun: true });
    expect(dryRun.updated.map((ref) => [ref.name, ref.unit]).sort()).toEqual([
      ['lp_conversion_rate', 'ratio'],
      ['lp_conversions', 'count'],
      ['lp_visitors', 'count'],
    ]);
    expect(dryRun.skippedCustomised.map((ref) => ref.name)).toEqual(['signups']);
    expect((await getActiveMetricDefinition(organization.id, project.id, 'lp_conversion_rate'))?.unit).toBeUndefined();

    const applied = await backfillBuiltinMetricUnits({ organizationId: organization.id, projectId: project.id });
    expect(applied.updated).toHaveLength(3);
    const rate = await getActiveMetricDefinition(organization.id, project.id, 'lp_conversion_rate');
    expect(rate?.unit).toBe('ratio');
    expect(rate?.version).toBe(1);
    expect((await getActiveMetricDefinition(organization.id, project.id, 'signups'))?.unit).toBeUndefined();
    expect((await getActiveMetricDefinition(organization.id, project.id, 'my_metric'))?.unit).toBeUndefined();

    const audit = await listAuditLogEntriesForOrg(organization.id);
    expect(audit.filter((entry) => entry.action === 'metric_def.set_unit')).toHaveLength(3);

    const rerun = await backfillBuiltinMetricUnits({ organizationId: organization.id, projectId: project.id });
    expect(rerun.updated).toEqual([]);
  });

  it('never overwrites a unit a human already declared', async () => {
    const { owner, organization, project } = await setup();
    await registerMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'lp_visitors', definition: visitors, dimensions: [], unit: 'number', createdByUserId: owner.id });
    const result = await backfillBuiltinMetricUnits({ organizationId: organization.id, projectId: project.id });
    expect(result.updated).toEqual([]);
    const stored = await MetricDefModel.initPath({ organization_id: organization.id, project_id: project.id }).where('name', '==', 'lp_visitors').get();
    expect(stored[0].unit).toBe('number');
  });

  it('requires organizationId alongside projectId', async () => {
    await expect(backfillBuiltinMetricUnits({ projectId: 'p' })).rejects.toThrow('projectId requires organizationId.');
  });
});
