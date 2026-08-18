import { describe, expect, it, vi } from 'vitest';
import type { CompiledMetricQuery } from '@growthos/shared';
import { BigQueryWarehouseQueryExecutor, type BigQueryQueryClient, type BigQueryQueryOptions } from './bigquery-query-executor';

function fakeClient(rows: Record<string, unknown>[]): { client: BigQueryQueryClient; calls: BigQueryQueryOptions[] } {
  const calls: BigQueryQueryOptions[] = [];
  return {
    calls,
    client: {
      query: async (options) => {
        calls.push(options);
        return [rows];
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
