import { describe, expect, it, vi } from 'vitest';
import type { CompiledMetricQuery } from '@growthos/shared';
import { BigQueryWarehouseQueryExecutor, type BigQueryQueryClient, type BigQueryQueryOptions } from './bigquery-query-executor';
import { WarehouseQueryFailedError } from './query-executor';

function fakeClient(rows: Record<string, unknown>[], response?: unknown): { client: BigQueryQueryClient; calls: BigQueryQueryOptions[] } {
  const calls: BigQueryQueryOptions[] = [];
  return {
    calls,
    client: {
      query: async (options) => {
        calls.push(options);
        return [rows, response];
      },
    },
  };
}

const compiled: CompiledMetricQuery = {
  sql: 'SELECT bucket_date, value_ad_spend AS `ad_spend` FROM leaf_ad_spend_current WHERE `channel` IN UNNEST(@filter_channels)',
  params: { time_start_current: '2026-01-01', filter_channels: ['google', 'meta'] },
};

describe('BigQueryWarehouseQueryExecutor', () => {
  it('passes the compiled SQL, params, dataset, and location through to the client', async () => {
    const { client, calls } = fakeClient([]);
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core', datasetProjectId: 'growthos-g2w84', location: 'me-west1' });

    await executor.execute(compiled);

    expect(calls).toEqual([
      {
        query: compiled.sql,
        params: { time_start_current: '2026-01-01', filter_channels: ['google', 'meta'] },
        defaultDataset: { datasetId: 'growthos_core', projectId: 'growthos-g2w84' },
        location: 'me-west1',
      },
    ]);
  });

  it('omits defaultDataset.projectId and location when not configured', async () => {
    const { client, calls } = fakeClient([]);
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });

    await executor.execute(compiled);

    expect(calls[0]).toEqual({
      query: compiled.sql,
      params: compiled.params,
      defaultDataset: { datasetId: 'growthos_core' },
    });
  });

  it('does not mutate the caller-owned array param value', async () => {
    const { client } = fakeClient([]);
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });
    const filterChannels = ['google'];
    const query: CompiledMetricQuery = { sql: compiled.sql, params: { filter_channels: filterChannels } };

    await executor.execute(query);

    expect(query.params.filter_channels).toBe(filterChannels);
  });

  it('unwraps BigQuery DATE/TIMESTAMP-shaped values ({ value: string }) to plain strings', async () => {
    const { client } = fakeClient([{ bucket_date: { value: '2026-01-01' }, ad_spend: 42 }]);
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });

    const rows = await executor.execute(compiled);

    expect(rows).toEqual([{ bucket_date: '2026-01-01', ad_spend: 42 }]);
  });

  it('normalizes bigint counts to plain numbers and passes null through', async () => {
    const { client } = fakeClient([{ signups: 12n, channel: null }]);
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });

    const rows = await executor.execute(compiled);

    expect(rows).toEqual([{ signups: 12, channel: null }]);
  });

  it('wraps a BigQuery-side rejection (e.g. table not found) in WarehouseQueryFailedError instead of leaking a generic Error', async () => {
    // A metric registered against a mart table dbt doesn't build is an
    // expected runtime outcome the moment a real warehouse is configured —
    // board tiles/goal thermometers degrade per-tile on this typed error;
    // a generic Error would rethrow through queryBoardTile's deliberate
    // non-blanket catch and crash the whole board page (hit for real on
    // dev the day the executor went live, 2026-08-19).
    const client: BigQueryQueryClient = {
      query: async () => {
        throw new Error('Not found: Table growthos-g2w84:growthos_core.fact_ad_spend was not found in location me-west1');
      },
    };
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });

    await expect(executor.execute(compiled)).rejects.toThrow(WarehouseQueryFailedError);
    await expect(executor.execute(compiled)).rejects.toThrow(/Not found: Table/);
  });
});

describe('BigQueryWarehouseQueryExecutor.executeWithStats', () => {
  it('estimates cost from the response totalBytesProcessed at $6.25/TiB', async () => {
    // 1 TiB exactly, so the estimate should land exactly on the documented per-TiB price.
    const { client } = fakeClient([{ ad_spend: 100 }], { totalBytesProcessed: String(2 ** 40) });
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });

    const { rows, stats } = await executor.executeWithStats(compiled);

    expect(rows).toEqual([{ ad_spend: 100 }]);
    expect(stats.estimatedCostUsd).toBeCloseTo(6.25, 10);
  });

  it('scales linearly with a fractional-TiB byte count', async () => {
    const { client } = fakeClient([], { totalBytesProcessed: String(2 ** 39) }); // 0.5 TiB
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });

    const { stats } = await executor.executeWithStats(compiled);

    expect(stats.estimatedCostUsd).toBeCloseTo(3.125, 10);
  });

  it('accepts a numeric totalBytesProcessed, not just a stringified one', async () => {
    const { client } = fakeClient([], { totalBytesProcessed: 2 ** 40 });
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });

    const { stats } = await executor.executeWithStats(compiled);

    expect(stats.estimatedCostUsd).toBeCloseTo(6.25, 10);
  });

  it('reports a null estimate when the response has no totalBytesProcessed', async () => {
    const { client } = fakeClient([], {});
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });

    const { stats } = await executor.executeWithStats(compiled);

    expect(stats.estimatedCostUsd).toBeNull();
  });

  it('reports a null estimate when the client returns no second response element at all', async () => {
    const { client } = fakeClient([]);
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });

    const { stats } = await executor.executeWithStats(compiled);

    expect(stats.estimatedCostUsd).toBeNull();
  });

  it('reports a null estimate for a non-numeric totalBytesProcessed instead of throwing or returning NaN', async () => {
    const { client } = fakeClient([], { totalBytesProcessed: 'not-a-number' });
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });

    const { stats } = await executor.executeWithStats(compiled);

    expect(stats.estimatedCostUsd).toBeNull();
  });

  it('still wraps a BigQuery-side rejection in WarehouseQueryFailedError', async () => {
    const client: BigQueryQueryClient = {
      query: async () => {
        throw new Error('Not found: Table growthos-g2w84:growthos_core.fact_ad_spend was not found');
      },
    };
    const executor = new BigQueryWarehouseQueryExecutor({ client, dataset: 'growthos_core' });

    await expect(executor.executeWithStats(compiled)).rejects.toThrow(WarehouseQueryFailedError);
  });
});

describe('createRealBigQueryClient', () => {
  it('constructs a BigQuery client scoped to the given project id', async () => {
    vi.resetModules();
    const queryMock = vi.fn().mockResolvedValue([[]]);
    const bigQueryCtor = vi.fn().mockImplementation(() => ({ query: queryMock }));
    vi.doMock('@google-cloud/bigquery', () => ({ BigQuery: bigQueryCtor }));

    const { createRealBigQueryClient: createRealBigQueryClientFresh } = await import('./bigquery-query-executor');
    const client = createRealBigQueryClientFresh('growthos-g2w84');
    await client.query({ query: 'SELECT 1' });

    expect(bigQueryCtor).toHaveBeenCalledWith({ projectId: 'growthos-g2w84' });
    expect(queryMock).toHaveBeenCalledWith({ query: 'SELECT 1' });

    vi.doUnmock('@google-cloud/bigquery');
    vi.resetModules();
  });
});
