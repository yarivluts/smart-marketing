import { describe, expect, it } from 'vitest';
import { getWarehouseFreshnessForProject } from './warehouse-freshness.service';
import { NotConfiguredWarehouseQueryExecutor, WarehouseQueryFailedError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';

/**
 * Pure fake-executor tests (no emulator, no real warehouse) — an explicit
 * `environmentId` is always passed here so the service never needs to
 * resolve a default environment from Firestore.
 */

function fakeExecutor(rows: WarehouseRow[]): { executor: WarehouseQueryExecutor; captured: { sql: string; params: Record<string, unknown> }[] } {
  const captured: { sql: string; params: Record<string, unknown> }[] = [];
  return {
    captured,
    executor: {
      execute: (query) => {
        captured.push({ sql: query.sql, params: query.params });
        return Promise.resolve(rows);
      },
    },
  };
}

const base = { organizationId: 'org-1', projectId: 'project-1', environmentId: 'env-prod-1' };

describe('getWarehouseFreshnessForProject', () => {
  it('reads latest landed_at + row count scoped to org/project/environment', async () => {
    const { executor, captured } = fakeExecutor([{ latest_landed_at: '2026-08-20 03:00:01', landed_record_count: 42 }]);

    const result = await getWarehouseFreshnessForProject({ ...base, executor });

    expect(result).toEqual({ status: 'ok', latestLandedAt: '2026-08-20 03:00:01', landedRecordCount: 42 });
    expect(captured[0].sql).toContain('FROM stg_raw_records');
    expect(captured[0].sql).toContain('environment_id = @environmentId');
    expect(captured[0].params).toEqual({ organizationId: 'org-1', projectId: 'project-1', environmentId: 'env-prod-1' });
  });

  it('reports zero rows as ok with a null latest timestamp (a fresh project, not an error)', async () => {
    const { executor } = fakeExecutor([{ latest_landed_at: null, landed_record_count: 0 }]);

    const result = await getWarehouseFreshnessForProject({ ...base, executor });

    expect(result).toEqual({ status: 'ok', latestLandedAt: null, landedRecordCount: 0 });
  });

  it('maps WarehouseNotConfiguredError to the not_configured state', async () => {
    const result = await getWarehouseFreshnessForProject({ ...base, executor: new NotConfiguredWarehouseQueryExecutor() });

    expect(result).toEqual({ status: 'not_configured' });
  });

  it('maps a warehouse-side rejection to the error state with its message', async () => {
    const executor: WarehouseQueryExecutor = {
      execute: () => Promise.reject(new WarehouseQueryFailedError('BigQuery rejected the compiled metric query: boom')),
    };

    const result = await getWarehouseFreshnessForProject({ ...base, executor });

    expect(result).toEqual({ status: 'error', message: 'BigQuery rejected the compiled metric query: boom' });
  });

  it('rethrows an unrecognized error instead of degrading it into a normal-looking state', async () => {
    const executor: WarehouseQueryExecutor = { execute: () => Promise.reject(new TypeError('coding bug')) };

    await expect(getWarehouseFreshnessForProject({ ...base, executor })).rejects.toThrow(TypeError);
  });
});
