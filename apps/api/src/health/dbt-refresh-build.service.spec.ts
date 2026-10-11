import type { AddressInfo } from 'node:net';
import { type INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  WarehouseNotConfiguredError,
  WarehouseQueryFailedError,
  type WarehouseQueryExecutor,
  type WarehouseRow,
} from '@growthos/firebase-orm-models';
import type { CompiledMetricQuery } from '@growthos/shared';
import {
  DBT_BUILD_INFO_CACHE_MS,
  DBT_BUILD_INFO_CLOCK,
  DBT_BUILD_INFO_EXECUTOR,
  DBT_BUILD_INFO_FAILURE_CACHE_MS,
  DbtRefreshBuildService,
} from './dbt-refresh-build.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PermissionGuard } from '../authz/permission.guard';

/**
 * The dbt-refresh Cloud Run Job has no endpoint, so api-prod reports the build it last
 * ran (KAN-204). On 2026-09-25 the job was found on a 2026-09-10 image: fifteen days of
 * merged model changes had never reached production and nothing noticed.
 */
class FakeWarehouse implements WarehouseQueryExecutor {
  readonly queries: CompiledMetricQuery[] = [];

  constructor(private respond: () => Promise<WarehouseRow[]>) {}

  execute(query: CompiledMetricQuery): Promise<WarehouseRow[]> {
    this.queries.push(query);
    return this.respond();
  }

  answer(respond: () => Promise<WarehouseRow[]>): void {
    this.respond = respond;
  }
}

function rows(...values: WarehouseRow[]): () => Promise<WarehouseRow[]> {
  return () => Promise.resolve(values);
}

function fails(error: Error): () => Promise<WarehouseRow[]> {
  return () => Promise.reject(error);
}

function tableNotFound(): WarehouseQueryFailedError {
  return new WarehouseQueryFailedError(
    'BigQuery rejected the compiled metric query: Not found: Table growthos-g2w84:growthos_core.dbt_build_info was not found in location me-west1',
  );
}

describe('DbtRefreshBuildService', () => {
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    clock = 1_000_000;
  });

  it('reports the build the job last recorded', async () => {
    const warehouse = new FakeWarehouse(rows({ build_sha: 'abc1234', recorded_at: '2026-09-26 03:00:12.123+00' }));
    await expect(new DbtRefreshBuildService(warehouse, now).getBuild()).resolves.toEqual({
      status: 'ok',
      service: 'dbt-refresh',
      buildSha: 'abc1234',
      recordedAt: '2026-09-26 03:00:12.123+00',
    });
  });

  /** Unqualified, so it resolves against the executor's defaultDataset like every other core read. */
  it('reads the one-row dbt_build_info table from the configured dataset, with no parameters', async () => {
    const warehouse = new FakeWarehouse(rows());
    await new DbtRefreshBuildService(warehouse, now).getBuild();
    expect(warehouse.queries).toHaveLength(1);
    expect(warehouse.queries[0]!.sql).toMatch(/\bFROM dbt_build_info\b/);
    expect(warehouse.queries[0]!.sql).toMatch(/\bLIMIT 1$/);
    expect(warehouse.queries[0]!.params).toEqual({});
  });

  it('validates the recorded value with the same rule as every other build SHA', async () => {
    const upper = new FakeWarehouse(rows({ build_sha: ' ABC1234 ', recorded_at: 'x' }));
    expect((await new DbtRefreshBuildService(upper, now).getBuild()).buildSha).toBe('abc1234');
    const bogus = new FakeWarehouse(rows({ build_sha: '${_GIT_SHA}', recorded_at: 'x' }));
    expect((await new DbtRefreshBuildService(bogus, now).getBuild()).buildSha).toBeNull();
  });

  it('reports null, not a sentinel, when the job ran unstamped', async () => {
    const warehouse = new FakeWarehouse(rows({ build_sha: null, recorded_at: '2026-09-26 03:00:12+00' }));
    expect(await new DbtRefreshBuildService(warehouse, now).getBuild()).toMatchObject({ buildSha: null, recordedAt: '2026-09-26 03:00:12+00' });
  });

  it('reports null when the table is empty', async () => {
    const warehouse = new FakeWarehouse(rows());
    expect(await new DbtRefreshBuildService(warehouse, now).getBuild()).toMatchObject({ buildSha: null, recordedAt: null });
  });

  /** Dev and CI have no warehouse: that is not an outage and must not look like one. */
  it('reports null when no warehouse is configured', async () => {
    const warehouse = new FakeWarehouse(fails(new WarehouseNotConfiguredError()));
    expect(await new DbtRefreshBuildService(warehouse, now).getBuild()).toMatchObject({ buildSha: null });
  });

  /**
   * The table first appears when an image carrying the model runs. Until then the job
   * is exactly "running an image that does not record its build" - unstamped.
   */
  it('reports null while the job has never run an image that records its build', async () => {
    const warehouse = new FakeWarehouse(fails(tableNotFound()));
    expect(await new DbtRefreshBuildService(warehouse, now).getBuild()).toMatchObject({ buildSha: null });
  });

  /**
   * Any other failure must not degrade to null: null reads as "unstamped", a mere
   * warning, and a warehouse outage would then silently switch the drift check off.
   */
  it.each([
    ['a missing dataset', new WarehouseQueryFailedError('BigQuery rejected the compiled metric query: Not found: Dataset growthos-g2w84:growthos_core')],
    ['a permission error', new WarehouseQueryFailedError('BigQuery rejected the compiled metric query: Access Denied')],
    ['an unexpected error', new Error('socket hang up')],
  ])('fails loudly (503) on %s', async (_label, error) => {
    const warehouse = new FakeWarehouse(fails(error));
    await expect(new DbtRefreshBuildService(warehouse, now).getBuild()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  /** Public and unauthenticated: request volume must not become query volume. */
  it('reuses one warehouse read for five minutes, then reads again', async () => {
    const warehouse = new FakeWarehouse(rows({ build_sha: 'aaaaaaa', recorded_at: 'x' }));
    const service = new DbtRefreshBuildService(warehouse, now);
    await service.getBuild();
    clock += DBT_BUILD_INFO_CACHE_MS - 1;
    await service.getBuild();
    expect(warehouse.queries).toHaveLength(1);

    warehouse.answer(rows({ build_sha: 'bbbbbbb', recorded_at: 'y' }));
    clock += 1;
    expect((await service.getBuild()).buildSha).toBe('bbbbbbb');
    expect(warehouse.queries).toHaveLength(2);
  });

  it('shares one in-flight read between concurrent requests', async () => {
    let release: (value: WarehouseRow[]) => void = () => undefined;
    const warehouse = new FakeWarehouse(() => new Promise<WarehouseRow[]>((resolve) => (release = resolve)));
    const service = new DbtRefreshBuildService(warehouse, now);
    const pending = Promise.all([service.getBuild(), service.getBuild(), service.getBuild()]);
    release([{ build_sha: 'abc1234', recorded_at: 'x' }]);
    const results = await pending;
    expect(results.map((r) => r.buildSha)).toEqual(['abc1234', 'abc1234', 'abc1234']);
    expect(warehouse.queries).toHaveLength(1);
  });

  it('caches a failure briefly, so an outage under load is still one query a minute', async () => {
    const warehouse = new FakeWarehouse(fails(new Error('boom')));
    const service = new DbtRefreshBuildService(warehouse, now);
    await expect(service.getBuild()).rejects.toBeInstanceOf(ServiceUnavailableException);
    clock += DBT_BUILD_INFO_FAILURE_CACHE_MS - 1;
    await expect(service.getBuild()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(warehouse.queries).toHaveLength(1);

    warehouse.answer(rows({ build_sha: 'abc1234', recorded_at: 'x' }));
    clock += 1;
    expect((await service.getBuild()).buildSha).toBe('abc1234');
    expect(warehouse.queries).toHaveLength(2);
  });
});

/**
 * Over real HTTP, behind the real fail-closed PermissionGuard: the drift check calls
 * this with no key, so it must be reachable with none.
 */
describe('GET /health/dbt-refresh (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const warehouse = new FakeWarehouse(rows({ build_sha: 'abc1234', recorded_at: '2026-09-26 03:00:12+00' }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        DbtRefreshBuildService,
        { provide: DBT_BUILD_INFO_EXECUTOR, useValue: warehouse },
        { provide: DBT_BUILD_INFO_CLOCK, useValue: () => 0 },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an anonymous request with the recorded build, uncached downstream', async () => {
    const res = await fetch(`${baseUrl}/health/dbt-refresh`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'ok', service: 'dbt-refresh', buildSha: 'abc1234', recordedAt: '2026-09-26 03:00:12+00' });
  });

  it('leaves the plain /health response untouched', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { service: string }).service).toBe('@growthos/api');
  });
});
