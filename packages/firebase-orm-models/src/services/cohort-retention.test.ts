import { describe, expect, it } from 'vitest';
import { queryCohortRetentionMatrix } from './cohort-retention.service';
import { CohortWarehouseNotConfiguredError, type CohortRetentionQuery, type CohortRetentionQueryExecutor, type CohortRetentionRow } from '../warehouse/cohort-query-executor';

class FakeCohortRetentionQueryExecutor implements CohortRetentionQueryExecutor {
  public calls: CohortRetentionQuery[] = [];
  constructor(private readonly rows: CohortRetentionRow[]) {}
  execute(query: CohortRetentionQuery): Promise<CohortRetentionRow[]> {
    this.calls.push(query);
    return Promise.resolve(this.rows);
  }
}

describe('queryCohortRetentionMatrix', () => {
  it('passes the request straight through to the injected executor and returns its rows', async () => {
    const rows: CohortRetentionRow[] = [
      { cohortMonth: '2026-01-01', periodIndex: 0, cohortSize: 2, convertedCustomers: 1, retentionRate: 0.5 },
      { cohortMonth: '2026-01-01', periodIndex: 2, cohortSize: 2, convertedCustomers: 1, retentionRate: 0.5 },
    ];
    const executor = new FakeCohortRetentionQueryExecutor(rows);

    const result = await queryCohortRetentionMatrix({
      organizationId: 'org_1',
      projectId: 'proj_11',
      conversionEvent: 'purchase',
      cohortMonthStart: '2026-01',
      cohortMonthEnd: '2026-04',
      executor,
    });

    expect(result).toEqual(rows);
    expect(executor.calls).toEqual([
      { organizationId: 'org_1', projectId: 'proj_11', conversionEvent: 'purchase', cohortMonthStart: '2026-01', cohortMonthEnd: '2026-04' },
    ]);
  });

  it('rejects with CohortWarehouseNotConfiguredError from the default executor when none is injected', async () => {
    await expect(
      queryCohortRetentionMatrix({
        organizationId: 'org_1',
        projectId: 'proj_11',
        conversionEvent: 'purchase',
        cohortMonthStart: '2026-01',
        cohortMonthEnd: '2026-04',
      }),
    ).rejects.toBeInstanceOf(CohortWarehouseNotConfiguredError);
  });
});
