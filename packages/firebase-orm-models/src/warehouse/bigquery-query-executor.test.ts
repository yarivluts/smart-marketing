import { describe, expect, it, vi } from 'vitest';
import type { CompiledMetricQuery } from '@growthos/shared';
import { BigQueryWarehouseQueryExecutor, type BigQueryQueryClient } from './bigquery-query-executor';
import type { WarehouseRow } from './query-executor';

const QUERY: CompiledMetricQuery = {
  sql: 'SELECT bucket_date, value_ad_spend AS `ad_spend` FROM `fact_ad_spend` WHERE `date` >= @time_start_current',
  params: { time_start_current: '2026-01-01', channels: ['google', 'meta'] },
};

describe('BigQueryWarehouseQueryExecutor', () => {
  it('delegates the compiled query to the client verbatim and returns its rows', async () => {
    const rows: WarehouseRow[] = [{ bucket_date: '2026-01-01', ad_spend: 42 }];
    const runQuery = vi.fn().mockResolvedValue(rows);
    const client: BigQueryQueryClient = { runQuery };

    const executor = new BigQueryWarehouseQueryExecutor(client);
    const result = await executor.execute(QUERY);

    expect(result).toBe(rows);
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(runQuery).toHaveBeenCalledWith(QUERY);
  });

  it('propagates a client rejection rather than swallowing it', async () => {
    const client: BigQueryQueryClient = { runQuery: vi.fn().mockRejectedValue(new Error('BigQuery job failed')) };
    const executor = new BigQueryWarehouseQueryExecutor(client);

    await expect(executor.execute(QUERY)).rejects.toThrow('BigQuery job failed');
  });
});
