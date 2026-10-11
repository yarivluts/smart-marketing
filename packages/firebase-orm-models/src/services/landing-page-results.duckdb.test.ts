import { describe, expect, it } from 'vitest';
import { buildLandingPageResultsQuery, LANDING_PAGE_RESULTS_TOP_ROWS, shapeLandingPageResults } from './landing-page-results.service';
import { runDuckDbQueries } from '../test-utils/duckdb-warehouse-executor';

/**
 * The Ad Studio's measured-results SQL (KAN-230) on a real engine (DuckDB, the dialect the dbt build
 * runs locally), over a `fact_landing_page_performance` table shaped like the dbt core model: sums
 * across days and channels, the window's first day, scoping, the per-part caps, and totals that stay
 * exact when the lists are capped.
 */

const ORG = 'org-1';
const PROJECT = 'proj-1';
const PROD = 'env-prod';

function sql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

interface FactRow {
  date: string;
  page: string;
  campaign: string;
  channel?: string;
  visitors: number;
  conversions: number;
  environmentId?: string;
  projectId?: string;
}

function factRow(row: FactRow): string {
  return `(${sql(ORG)}, ${sql(row.projectId ?? PROJECT)}, ${sql(row.environmentId ?? PROD)}, DATE ${sql(row.date)}, ${sql(row.page)}, ${sql(row.campaign)}, ${sql(row.channel ?? 'paid_search')}, ${row.visitors}, ${row.conversions})`;
}

function results(rows: FactRow[], since = '2026-07-01') {
  const setup = [
    'CREATE TABLE fact_landing_page_performance (organization_id VARCHAR, project_id VARCHAR, environment_id VARCHAR, activity_date DATE, landing_page VARCHAR, campaign_id VARCHAR, channel_id VARCHAR, visitors BIGINT, conversions BIGINT)',
    ...(rows.length > 0 ? [`INSERT INTO fact_landing_page_performance VALUES ${rows.map(factRow).join(', ')}`] : []),
  ];
  const [queryRows] = runDuckDbQueries(setup, [buildLandingPageResultsQuery({ organizationId: ORG, projectId: PROJECT, environmentId: PROD, since })]);
  return shapeLandingPageResults(queryRows);
}

describe('buildLandingPageResultsQuery on DuckDB', () => {
  it('sums each page and campaign across days and channels, with the rate from the sums', () => {
    const shaped = results([
      { date: '2026-07-01', page: '/lawyers', campaign: 'cmp-a', visitors: 100, conversions: 5 },
      { date: '2026-07-02', page: '/lawyers', campaign: 'cmp-a', channel: 'paid_social', visitors: 100, conversions: 7 },
      { date: '2026-07-02', page: '/pricing', campaign: 'cmp-b', visitors: 50, conversions: 0 },
      { date: '2026-07-03', page: '/lawyers', campaign: 'cmp-b', visitors: 0, conversions: 3 },
    ]);
    expect(shaped.totals).toEqual({ visitors: 250, conversions: 15, conversionRate: 15 / 250 });
    expect(shaped.landingPages).toEqual([
      { key: '/lawyers', visitors: 200, conversions: 15, conversionRate: 15 / 200 },
      { key: '/pricing', visitors: 50, conversions: 0, conversionRate: 0 },
    ]);
    expect(shaped.campaigns).toEqual([
      { key: 'cmp-a', visitors: 200, conversions: 12, conversionRate: 0.06 },
      { key: 'cmp-b', visitors: 50, conversions: 3, conversionRate: 0.06 },
    ]);
  }, 120_000);

  it('starts on the window day, and leaves other environments and projects out', () => {
    const shaped = results([
      { date: '2026-06-30', page: '/old', campaign: 'cmp-old', visitors: 999, conversions: 99 },
      { date: '2026-07-01', page: '/new', campaign: 'cmp-new', visitors: 10, conversions: 1 },
      { date: '2026-07-01', page: '/dev', campaign: 'cmp-dev', visitors: 500, conversions: 50, environmentId: 'env-dev' },
      { date: '2026-07-01', page: '/other', campaign: 'cmp-other', visitors: 500, conversions: 50, projectId: 'proj-2' },
    ]);
    expect(shaped.totals).toEqual({ visitors: 10, conversions: 1, conversionRate: 0.1 });
    expect(shaped.landingPages.map((row) => row.key)).toEqual(['/new']);
    expect(shaped.campaigns.map((row) => row.key)).toEqual(['cmp-new']);
  }, 120_000);

  it('caps each list at the busiest rows while the totals still cover every row', () => {
    const rows = Array.from({ length: LANDING_PAGE_RESULTS_TOP_ROWS + 5 }, (_, index) => ({
      date: '2026-07-05',
      page: `/page-${index}`,
      campaign: `cmp-${index}`,
      visitors: index + 1,
      conversions: 0,
    }));
    const shaped = results(rows);
    expect(shaped.landingPages).toHaveLength(LANDING_PAGE_RESULTS_TOP_ROWS);
    expect(shaped.landingPages[0].key).toBe(`/page-${LANDING_PAGE_RESULTS_TOP_ROWS + 4}`);
    expect(shaped.campaigns).toHaveLength(LANDING_PAGE_RESULTS_TOP_ROWS);
    expect(shaped.totals.visitors).toBe(rows.reduce((sum, row) => sum + row.visitors, 0));
  }, 120_000);

  it('an empty window is zero with no rate, not an error', () => {
    expect(results([])).toEqual({ totals: { visitors: 0, conversions: 0, conversionRate: null }, landingPages: [], campaigns: [] });
  }, 120_000);

  it('binds every value as a parameter, never into the SQL text', () => {
    const query = buildLandingPageResultsQuery({ organizationId: "o'1", projectId: PROJECT, environmentId: PROD, since: '2026-07-01' });
    expect(query.sql).not.toContain("o'1");
    expect(query.sql).not.toContain('2026-07-01');
    expect(query.sql).toContain('CAST(@since AS DATE)');
    expect(query.params).toEqual({ organizationId: "o'1", projectId: PROJECT, environmentId: PROD, since: '2026-07-01' });
  });
});
