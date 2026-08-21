import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  evolveMetricDefinition,
  getMetricCatalogDetail,
  InMemoryMetricQueryResultCache,
  listEnvironmentsForProject,
  listMetricsCatalogForProject,
  listQueryCostLogEntriesForProject,
  ProjectQueryQuotaExceededError,
  queryMetrics,
  registerMetricDefinition,
  setProjectCostQuota,
  WarehouseNotConfiguredError,
  type WarehouseQueryExecutor,
  type WarehouseQueryExecutorWithStats,
  type WarehouseQueryStats,
  type WarehouseRow,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-42's `queryMetrics`/catalog read-side — the Firestore-resolving layer `POST /v1/metrics/query` and `GET /v1/metrics(/{name})` sit on top of. */

beforeAll(async () => {
  await connectToFirestoreEmulator('metrics-query-tests');
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

/** A fake executor that records every compiled query it was asked to run and returns canned rows — stands in for a real BigQuery client, the same way `metrics-compiler.emulator.test.ts` never needs one either. */
class FakeWarehouseQueryExecutor implements WarehouseQueryExecutor {
  public callCount = 0;
  constructor(private readonly rows: WarehouseRow[]) {}
  execute(): Promise<WarehouseRow[]> {
    this.callCount += 1;
    return Promise.resolve(this.rows);
  }
}

/** Same as {@link FakeWarehouseQueryExecutor} but also implements `executeWithStats`, standing in for the real `BigQueryWarehouseQueryExecutor` (KAN-18) to prove `queryMetrics` actually threads a real cost estimate into the logged entry rather than always logging `null`. */
class FakeWarehouseQueryExecutorWithStats implements WarehouseQueryExecutorWithStats {
  public callCount = 0;
  constructor(private readonly rows: WarehouseRow[], private readonly estimatedCostUsd: number | null) {}
  execute(): Promise<WarehouseRow[]> {
    this.callCount += 1;
    return Promise.resolve(this.rows);
  }
  executeWithStats(): Promise<{ rows: WarehouseRow[]; stats: WarehouseQueryStats }> {
    this.callCount += 1;
    return Promise.resolve({ rows: this.rows, stats: { estimatedCostUsd: this.estimatedCostUsd } });
  }
}

describe('queryMetrics', () => {
  it('compiles and executes a registered metric, returning its definitionRefs', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Query Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const rows: WarehouseRow[] = [{ bucket_date: '2026-01-01', ad_spend: 100 }];
    const executor = new FakeWarehouseQueryExecutor(rows);

    const result = await queryMetrics({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(result.series).toEqual(rows);
    expect(result.definitionRefs).toEqual({ ad_spend: 'metric:ad_spend@v1' });
    expect(result.cacheHit).toBe(false);
    expect(executor.callCount).toBe(1);
  });

  it('scopes the compiled query to the project\'s prod environment by default, and to a caller-passed environment when one is given (session-B mixing catch, 2026-08-19)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Query Env Scope Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const environments = await listEnvironmentsForProject(organization.id, project.id);
    const prodEnv = environments.find((environment) => environment.name === 'prod');
    const devEnv = environments.find((environment) => environment.name === 'dev');
    expect(prodEnv).toBeDefined();
    expect(devEnv).toBeDefined();

    const captured: Record<string, unknown>[] = [];
    const capturingExecutor: WarehouseQueryExecutor = {
      execute: (query) => {
        captured.push(query.params);
        return Promise.resolve([]);
      },
    };
    const request = { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' as const } };
    const cache = new InMemoryMetricQueryResultCache();

    // No environmentId → the prod environment, never a blend of all three.
    await queryMetrics({ organizationId: organization.id, projectId: project.id, request, executor: capturingExecutor, cache });
    expect(captured[0].tenant_environment_id).toBe(prodEnv?.id);

    // An explicit environmentId (an API key's own binding) wins over the default.
    await queryMetrics({ organizationId: organization.id, projectId: project.id, environmentId: devEnv?.id, request, executor: capturingExecutor, cache });
    expect(captured[1].tenant_environment_id).toBe(devEnv?.id);

    // And the two environments' identical requests did NOT share a cache
    // entry — the second call reached the executor rather than reading the
    // first's cached rows (the cross-environment cache leak the key guards
    // against).
    expect(captured).toHaveLength(2);
  });

  it('serves a repeat request for the same definition versions+params from cache without re-executing', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Query Cache Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'signups',
      // A real (non-`KNOWN_UNBUILT_WAREHOUSE_TABLES`) table, deliberately not `fact_funnel_event`
      // (the SaaS pack's real `signups` table) — this test exercises the cache/executor plumbing,
      // which is only reachable once a query compiles past the "buildable table" fast-fail.
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_landing_page_performance', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', signups: 5 }]);
    const cache = new InMemoryMetricQueryResultCache();
    const request = { metrics: ['signups'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' as const } };

    const first = await queryMetrics({ organizationId: organization.id, projectId: project.id, request, executor, cache });
    const second = await queryMetrics({ organizationId: organization.id, projectId: project.id, request, executor, cache });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.series).toEqual(first.series);
    expect(executor.callCount).toBe(1);
  });

  it('does not leak a cached result across two projects that each define a same-named, same-version metric (shared cache instance)', async () => {
    const first = await setupOrgWithProject('Cache Isolation Org A');
    const second = await setupOrgWithProject('Cache Isolation Org B');
    for (const { owner, organization, project } of [first, second]) {
      await registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'ad_spend',
        definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
        dimensions: [],
        createdByUserId: owner.id,
      });
    }
    const cache = new InMemoryMetricQueryResultCache();
    const request = { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' as const } };
    const executorA = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', ad_spend: 100 }]);
    const executorB = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', ad_spend: 999 }]);

    const resultA = await queryMetrics({ organizationId: first.organization.id, projectId: first.project.id, request, executor: executorA, cache });
    const resultB = await queryMetrics({ organizationId: second.organization.id, projectId: second.project.id, request, executor: executorB, cache });

    // Both hit the same cache instance with identical definitionRefs (`metric:ad_spend@v1`) and params —
    // without organizationId/projectId in the cache key, B would wrongly get back A's cached series.
    expect(resultA.cacheHit).toBe(false);
    expect(resultB.cacheHit).toBe(false);
    expect(resultB.series).toEqual([{ bucket_date: '2026-01-01', ad_spend: 999 }]);
    expect(executorB.callCount).toBe(1);
  });

  it('misses the cache once a dependency metric evolves to a new version, even for an identical request', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Query Evolve Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', ad_spend: 100 }]);
    const cache = new InMemoryMetricQueryResultCache();
    const request = { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' as const } };

    await queryMetrics({ organizationId: organization.id, projectId: project.id, request, executor, cache });
    await evolveMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'net_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const afterEvolve = await queryMetrics({ organizationId: organization.id, projectId: project.id, request, executor, cache });

    expect(afterEvolve.cacheHit).toBe(false);
    expect(afterEvolve.definitionRefs).toEqual({ ad_spend: 'metric:ad_spend@v2' });
    expect(executor.callCount).toBe(2);
  });

  it('propagates WarehouseNotConfiguredError when no executor is injected (the real default)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Query No Executor Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    await expect(
      queryMetrics({
        organizationId: organization.id,
        projectId: project.id,
        request: { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
        cache: new InMemoryMetricQueryResultCache(),
      }),
    ).rejects.toThrow(WarehouseNotConfiguredError);

    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe('warehouse_not_configured');
  });

  it('logs an "executed" cost entry once a query actually reaches the executor (KAN-39)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Cost Log Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', ad_spend: 100 }]);

    await queryMetrics({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe('executed');
    expect(entries[0].definition_refs).toEqual({ ad_spend: 'metric:ad_spend@v1' });
    expect(entries[0].estimated_cost_usd).toBeNull();
  });

  it('logs the executor-reported estimated cost when the executor supports query stats (KAN-39, real BigQuery)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Cost Log Stats Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutorWithStats([{ bucket_date: '2026-01-01', ad_spend: 100 }], 1.23);

    const result = await queryMetrics({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(result.series).toEqual([{ bucket_date: '2026-01-01', ad_spend: 100 }]);
    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].estimated_cost_usd).toBe(1.23);
  });

  it('logs null when a stats-capable executor could not determine a cost for this call', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Cost Log Stats Null Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutorWithStats([{ bucket_date: '2026-01-01', ad_spend: 100 }], null);

    await queryMetrics({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries[0].estimated_cost_usd).toBeNull();
  });

  it('does not log or count a cache hit against the quota (KAN-39)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Cost Log Cache Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', ad_spend: 100 }]);
    const cache = new InMemoryMetricQueryResultCache();
    const request = { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' as const } };

    await queryMetrics({ organizationId: organization.id, projectId: project.id, request, executor, cache });
    await queryMetrics({ organizationId: organization.id, projectId: project.id, request, executor, cache });

    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries).toHaveLength(1);
  });

  it('throws ProjectQueryQuotaExceededError once the project has spent its daily quota (KAN-39)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Cost Log Quota Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });
    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', ad_spend: 100 }]);
    const cache = new InMemoryMetricQueryResultCache();

    // Two distinct time windows so the second call is a genuine cache miss, not served from cache.
    await queryMetrics({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
      executor,
      cache,
    });

    await expect(
      queryMetrics({
        organizationId: organization.id,
        projectId: project.id,
        request: { metrics: ['ad_spend'], time: { start: '2026-02-01', end: '2026-02-07', grain: 'day' } },
        executor,
        cache,
      }),
    ).rejects.toThrow(ProjectQueryQuotaExceededError);

    expect(executor.callCount).toBe(1);
    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries.map((entry) => entry.outcome).sort()).toEqual(['blocked_quota_exceeded', 'executed']);
  });

  it('fails fast with MetricTargetsUnbuiltWarehouseTableError for a metric targeting a known-unbuilt table, without touching the executor, cache, or cost-quota log', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Unbuilt Table Org');
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
    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', signups: 5 }]);

    await expect(
      queryMetrics({
        organizationId: organization.id,
        projectId: project.id,
        request: { metrics: ['signups'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
        executor,
        cache: new InMemoryMetricQueryResultCache(),
      }),
    ).rejects.toThrowError(expect.objectContaining({ name: 'MetricTargetsUnbuiltWarehouseTableError', metricName: 'signups', table: 'fact_funnel_event' }));

    expect(executor.callCount).toBe(0);
    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries).toEqual([]);
  });
});

describe('listMetricsCatalogForProject', () => {
  it('lists only active versions, one entry per metric family', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Catalog Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: ['channel'],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'signups',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_funnel_event', timeColumn: 'ts', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    await evolveMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'signups',
      definition: { kind: 'aggregation', aggregation: { function: 'count_distinct', table: 'fact_funnel_event', column: 'customer_id', timeColumn: 'ts', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const catalog = await listMetricsCatalogForProject(organization.id, project.id);

    expect(catalog).toHaveLength(2);
    expect(catalog.find((entry) => entry.name === 'signups')).toEqual({ name: 'signups', version: 2, definitionKind: 'aggregation', dimensions: [] });
    expect(catalog.find((entry) => entry.name === 'ad_spend')).toEqual({ name: 'ad_spend', version: 1, definitionKind: 'aggregation', dimensions: ['channel'] });
  });

  it('returns an empty catalog for a project with no registered metrics', async () => {
    const { project, organization } = await setupOrgWithProject('Empty Catalog Org');
    expect(await listMetricsCatalogForProject(organization.id, project.id)).toEqual([]);
  });
});

describe('getMetricCatalogDetail', () => {
  it('returns null for an unregistered metric name', async () => {
    const { organization, project } = await setupOrgWithProject('Detail Missing Org');
    expect(await getMetricCatalogDetail(organization.id, project.id, 'does_not_exist')).toBeNull();
  });

  it('returns an aggregation metric with an empty dependsOn', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Detail Agg Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: ['channel'],
      createdByUserId: owner.id,
    });

    const detail = await getMetricCatalogDetail(organization.id, project.id, 'ad_spend');

    expect(detail).toEqual({
      name: 'ad_spend',
      version: 1,
      definitionKind: 'aggregation',
      dimensions: ['channel'],
      aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] },
      dependsOn: [],
    });
  });

  it('returns a formula metric with its direct dependencies as dependsOn', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Detail Formula Org');
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
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_funnel_event', timeColumn: 'ts', filters: [] } },
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

    const detail = await getMetricCatalogDetail(organization.id, project.id, 'cost_per_signup');

    expect(detail?.formula).toBe('ad_spend / signups');
    expect(detail?.dependsOn).toEqual(expect.arrayContaining(['ad_spend', 'signups']));
    expect(detail?.dependsOn).toHaveLength(2);
  });
});
