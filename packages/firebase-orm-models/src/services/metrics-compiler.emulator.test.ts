import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  compileMetricQueryForProject,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  KNOWN_UNBUILT_WAREHOUSE_TABLES,
  MetricDefModel,
  MetricNotRegisteredError,
  ProjectModel,
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
    // `tenant_organization_id`/`tenant_project_id` (KAN-18 tenant-isolation fix): `compileMetricQueryForProject`
    // always compiles in the requesting org/project as a bind param — see `CompilerTenant`'s own doc comment.
    expect(compiled.params).toEqual({
      time_start_current: '2026-01-01',
      time_end_current: '2026-01-07',
      tenant_organization_id: organization.id,
      tenant_project_id: project.id,
    });
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

  it('still compiles successfully but reports unbuiltWarehouseTables when a metric targets a known-unbuilt table (compiling is not the same as being executable)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Compiler Unbuilt Table Org');
    // `KNOWN_UNBUILT_WAREHOUSE_TABLES` is empty today (every table it used to
    // list — see its own doc comment — now has a real dbt core model), so
    // this test exercises the generic mechanism itself against a
    // deliberately fabricated table name, added just for this one test.
    const fixtureOnlyUnbuiltTable = 'fixture_only_unbuilt_table_for_test';
    KNOWN_UNBUILT_WAREHOUSE_TABLES.add(fixtureOnlyUnbuiltTable);
    try {
      await registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'signups',
        definition: {
          kind: 'aggregation',
          aggregation: { function: 'count_distinct', table: fixtureOnlyUnbuiltTable, column: 'customer_id', timeColumn: 'ts', filters: [{ field: 'step', operator: '=', value: 'signup' }] },
        },
        dimensions: [],
        createdByUserId: owner.id,
      });

      const compiled = await compileMetricQueryForProject({
        organizationId: organization.id,
        projectId: project.id,
        request: { metrics: ['signups'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
      });

      // Compiles fine — this is a pure "resolve + compile" step, decoupled from whether the real
      // warehouse can actually run it (that's the execution layer's own concern, `queryMetrics`).
      expect(compiled.sql).toContain(`\`${fixtureOnlyUnbuiltTable}\``);
      expect(compiled.unbuiltWarehouseTables).toEqual([{ metricName: 'signups', table: fixtureOnlyUnbuiltTable }]);
    } finally {
      KNOWN_UNBUILT_WAREHOUSE_TABLES.delete(fixtureOnlyUnbuiltTable);
    }
  });

  it('reports no unbuilt tables for a metric registered against a real (non-aspirational) table', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Compiler Built Table Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const compiled = await compileMetricQueryForProject({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
    });

    expect(compiled.unbuiltWarehouseTables).toEqual([]);
  });

  it('reports no unbuilt tables for signups (fact_funnel_event) now that a real core model backs it (2026-08-21 KAN-59 follow-up)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Compiler Funnel Event Now Real Org');
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

    const compiled = await compileMetricQueryForProject({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['signups'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
    });

    expect(compiled.unbuiltWarehouseTables).toEqual([]);
  });

  it('resolves a metric from precomputedActiveMetricDefsByName instead of fetching it from Firestore (board-tile-N+1 fix)', async () => {
    const { organization, project } = await setupOrgWithProject('Compiler Precomputed Catalog Org');
    // Deliberately never registered via `registerMetricDefinition` — if this
    // compiles successfully, it can only be because `resolveCatalog` read it
    // from the supplied map rather than issuing its own Firestore fetch
    // (which would find nothing and throw `MetricNotRegisteredError`, as the
    // "rejects a query naming a metric that was never registered" test above
    // proves for the same unregistered-name case without a precomputed map).
    const phantom = new MetricDefModel();
    phantom.organization_id = organization.id;
    phantom.project_id = project.id;
    phantom.name = 'phantom_metric';
    phantom.version = 7;
    phantom.status = 'active';
    phantom.definition_kind = 'aggregation';
    phantom.aggregation = { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] };
    phantom.dimensions = [];
    phantom.created_by = 'test-fixture';
    phantom.created_at = new Date().toISOString();

    const compiled = await compileMetricQueryForProject({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['phantom_metric'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
      precomputedActiveMetricDefsByName: new Map([['phantom_metric', phantom]]),
    });

    expect(compiled.sql).toContain('SUM(`reporting_spend`)');
    // The version on the returned `definitionRefs` is the phantom's own `7`,
    // not whatever (nonexistent) version a live Firestore fetch would have
    // found — proving the map's own entry was actually used, not just that
    // resolution merely "succeeded".
    expect(compiled.definitionRefs).toEqual({ phantom_metric: 'metric:phantom_metric@v7' });
  });

  it('still rejects an unregistered metric that is absent from a supplied precomputedActiveMetricDefsByName map, rather than silently treating the map as exhaustive', async () => {
    const { organization, project } = await setupOrgWithProject('Compiler Precomputed Catalog Miss Org');

    await expect(
      compileMetricQueryForProject({
        organizationId: organization.id,
        projectId: project.id,
        request: { metrics: ['does_not_exist'], time: { start: '2026-01-01', end: '2026-01-01', grain: 'day' } },
        precomputedActiveMetricDefsByName: new Map(),
      }),
    ).rejects.toThrow(MetricNotRegisteredError);
  });

  it('rejects a precomputedProject that does not match organizationId/projectId, rather than compiling against the wrong tenant', async () => {
    const { organization, project } = await setupOrgWithProject('Compiler Precomputed Project Org');
    const { organization: otherOrg, project: otherProject } = await setupOrgWithProject('Compiler Precomputed Project Other Org');
    const mismatchedProject = await ProjectModel.init(otherProject.id, { organization_id: otherOrg.id });

    await expect(
      compileMetricQueryForProject({
        organizationId: organization.id,
        projectId: project.id,
        request: { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-01', grain: 'day' } },
        precomputedProject: mismatchedProject!,
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });
});
