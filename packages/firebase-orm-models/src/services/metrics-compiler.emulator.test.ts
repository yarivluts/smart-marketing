import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  compileMetricQueryForProject,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  MetricNotRegisteredError,
  ProjectNotFoundError,
  registerMetricDefinition,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-41's `compileMetricQueryForProject` — the Firestore-resolving wrapper around `@growthos/shared`'s pure compiler (see that package's own golden-file tests for SQL-shape coverage). */

beforeAll(async () => {
  await connectToFirestoreEmulator('metrics-compiler-tests');
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

describe('compileMetricQueryForProject', () => {
  it('resolves a registered aggregation and compiles it to SQL', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Compiler Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: ['channel'],
      createdByUserId: owner.id,
    });

    const compiled = await compileMetricQueryForProject({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['ad_spend'], dimensions: ['channel'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
    });

    expect(compiled.sql).toContain('SUM(`reporting_spend`)');
    expect(compiled.sql).toContain('`fact_ad_spend`');
    expect(compiled.params).toEqual({ time_start_current: '2026-01-01', time_end_current: '2026-01-07' });
    expect(compiled.definitionRefs).toEqual({ ad_spend: 'metric:ad_spend@v1' });
  });

  it('recursively resolves every metric a formula transitively references, including through another formula', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Compiler Formula Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'signups',
      definition: {
        kind: 'aggregation',
        aggregation: { function: 'count_distinct', table: 'fact_funnel_event', column: 'customer_id', timeColumn: 'ts', filters: [{ field: 'step', operator: '=', value: 'signup' }] },
      },
      dimensions: [],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'cost_per_signup',
      definition: { kind: 'formula', formula: 'ad_spend / signups' },
      dimensions: [],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'double_cost_per_signup',
      definition: { kind: 'formula', formula: 'cost_per_signup * 2' },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const compiled = await compileMetricQueryForProject({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['double_cost_per_signup'], time: { start: '2026-01-01', end: '2026-01-31', grain: 'month' } },
    });

    expect(compiled.sql).toContain('SAFE_DIVIDE(value_ad_spend, value_signups)');
    expect(compiled.definitionRefs).toEqual({
      double_cost_per_signup: 'metric:double_cost_per_signup@v1',
      cost_per_signup: 'metric:cost_per_signup@v1',
      ad_spend: 'metric:ad_spend@v1',
      signups: 'metric:signups@v1',
    });
  });

  it('rejects an unknown project id', async () => {
    const { organization } = await setupOrgWithProject('Compiler No Project Org');
    await expect(
      compileMetricQueryForProject({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        request: { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-01', grain: 'day' } },
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('rejects a query naming a metric that was never registered', async () => {
    const { organization, project } = await setupOrgWithProject('Compiler Unregistered Org');
    await expect(
      compileMetricQueryForProject({
        organizationId: organization.id,
        projectId: project.id,
        request: { metrics: ['does_not_exist'], time: { start: '2026-01-01', end: '2026-01-01', grain: 'day' } },
      }),
    ).rejects.toThrow(MetricNotRegisteredError);
  });

  it('accumulates every missing metric name into one error rather than throwing on the first', async () => {
    const { organization, project } = await setupOrgWithProject('Compiler Multi Missing Org');
    await expect(
      compileMetricQueryForProject({
        organizationId: organization.id,
        projectId: project.id,
        request: { metrics: ['missing_one', 'missing_two'], time: { start: '2026-01-01', end: '2026-01-01', grain: 'day' } },
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ names: expect.arrayContaining(['missing_one', 'missing_two']) }),
    );
  });
});
