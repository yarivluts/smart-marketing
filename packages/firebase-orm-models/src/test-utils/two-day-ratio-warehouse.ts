import type { CompiledMetricQuery } from '@growthos/shared';
import type { WarehouseQueryExecutor, WarehouseRow } from '../warehouse/query-executor';
import { registerMetricDefinition } from '../services/metric-registry.service';

/**
 * Test-only fixture for B24 (a ratio's period value). The reported case: a landing page converts
 * 1 of 1 visitor on day 1 (100%) and 1 of 100 on day 2 (1%). Its real rate over the two days is
 * 2/101 = 1.98%; the mean of the two daily rates - what a big-number tile used to show - is 50.5%.
 */
export const TWO_DAY_RATIO_DAYS = [
  { date: '2026-09-01', conversions: 1, visitors: 1 },
  { date: '2026-09-02', conversions: 1, visitors: 100 },
] as const;

export const TWO_DAY_RATIO_PERIOD_VALUE = 2 / 101;
export const TWO_DAY_RATIO_MEAN_OF_DAILY_RATES = (1 / 1 + 1 / 100) / 2;

/** Registers `lp_visitors`/`lp_conversions` (sums) and `lp_conversion_rate` (their ratio, unit `ratio`) - the landing-page pack's own definitions. */
export async function registerTwoDayRatioMetrics(organizationId: string, projectId: string, createdByUserId: string): Promise<void> {
  for (const [name, column] of [
    ['lp_visitors', 'visitors'],
    ['lp_conversions', 'conversions'],
  ] as const) {
    await registerMetricDefinition({
      organizationId,
      projectId,
      name,
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_landing_page_performance', column, timeColumn: 'activity_date', filters: [] } },
      dimensions: ['campaign_id'],
      unit: 'count',
      createdByUserId,
    });
  }
  await registerMetricDefinition({
    organizationId,
    projectId,
    name: 'lp_conversion_rate',
    definition: { kind: 'formula', formula: 'lp_conversions / lp_visitors' },
    dimensions: ['campaign_id'],
    unit: 'ratio',
    createdByUserId,
  });
}

/**
 * A fake warehouse holding {@link TWO_DAY_RATIO_DAYS}, answering a compiled query the way the
 * compiled SQL would: at a calendar grain (`DATE_TRUNC` in the SQL) one row per day with each
 * metric's own daily value; at the `total` grain (the window's start date stamped via
 * `CAST(@time_start_current AS DATE)`) one row whose ratio is the period's summed conversions over
 * its summed visitors. Only the current window is answered - the fixture has no earlier days, so a
 * compared previous window is empty, as the real query would leave it. Records every query so a
 * test can assert what was asked.
 */
export class TwoDayRatioWarehouse implements WarehouseQueryExecutor {
  public readonly queries: CompiledMetricQuery[] = [];

  execute(query: CompiledMetricQuery): Promise<WarehouseRow[]> {
    this.queries.push(query);
    const start = String(query.params.time_start_current);
    const end = String(query.params.time_end_current);
    const days = TWO_DAY_RATIO_DAYS.filter((day) => day.date >= start && day.date <= end);
    if (days.length === 0) {
      return Promise.resolve([]);
    }
    const compared = query.sql.includes("'current' AS period");
    const selects = (metric: string) => query.sql.includes(`AS \`${metric}\``);
    const toRow = (bucket: string, conversions: number, visitors: number): WarehouseRow => ({
      ...(compared ? { period: 'current' } : {}),
      bucket_date: bucket,
      ...(selects('lp_conversions') ? { lp_conversions: conversions } : {}),
      ...(selects('lp_visitors') ? { lp_visitors: visitors } : {}),
      ...(selects('lp_conversion_rate') ? { lp_conversion_rate: visitors === 0 ? null : conversions / visitors } : {}),
    });

    if (query.sql.includes('DATE_TRUNC')) {
      return Promise.resolve(days.map((day) => toRow(day.date, day.conversions, day.visitors)));
    }
    if (!query.sql.includes('CAST(@time_start_current AS DATE)')) {
      throw new Error(`TwoDayRatioWarehouse: unrecognized query shape:\n${query.sql}`);
    }
    const conversions = days.reduce((sum, day) => sum + day.conversions, 0);
    const visitors = days.reduce((sum, day) => sum + day.visitors, 0);
    return Promise.resolve([toRow(start, conversions, visitors)]);
  }
}
