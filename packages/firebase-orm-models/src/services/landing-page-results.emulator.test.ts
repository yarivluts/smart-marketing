import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, getLandingPageResults, listQueryCostLogEntriesForProject, setProjectCostQuota } from '../index';
import { NotConfiguredWarehouseQueryExecutor, WarehouseQueryFailedError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * `getLandingPageResults` runs behind `runQuotaGatedWarehouseQuery`, which reads the project and its
 * daily cost quota from Firestore on every call - hence the emulator. The SQL itself is proven on
 * DuckDB in `landing-page-results.duckdb.test.ts`.
 */

function fakeExecutor(rows: WarehouseRow[]): { executor: WarehouseQueryExecutor; calls: { sql: string; params: Record<string, unknown> }[] } {
  const calls: { sql: string; params: Record<string, unknown> }[] = [];
  return {
    calls,
    executor: {
      execute: (query) => {
        calls.push(query);
        return Promise.resolve(rows);
      },
    },
  };
}

beforeAll(async () => {
  await connectToFirestoreEmulator('landing-page-results-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Results Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, orgId: organization.id, projectId: project.id };
}

describe('getLandingPageResults', () => {
  it('returns the shaped totals, pages and campaigns, scoped and bound, and logs the query cost', async () => {
    const { orgId, projectId } = await setup();
    const { executor, calls } = fakeExecutor([
      { dimension: 'total', dimension_value: '', visitors: 300, conversions: 12 },
      { dimension: 'landing_page', dimension_value: '/lawyers', visitors: '200', conversions: '10' },
      { dimension: 'campaign', dimension_value: 'cmp-a', visitors: 300, conversions: 12 },
    ]);
    const result = await getLandingPageResults({ organizationId: orgId, projectId, environmentId: 'env-prod', since: '2026-06-29', executor });
    expect(result).toEqual({
      status: 'ok',
      totals: { visitors: 300, conversions: 12, conversionRate: 0.04 },
      landingPages: [{ key: '/lawyers', visitors: 200, conversions: 10, conversionRate: 0.05 }],
      campaigns: [{ key: 'cmp-a', visitors: 300, conversions: 12, conversionRate: 0.04 }],
    });
    expect(calls[0].params).toEqual({ organizationId: orgId, projectId, environmentId: 'env-prod', since: '2026-06-29' });
    const entries = await listQueryCostLogEntriesForProject(orgId, projectId);
    expect(entries.some((entry) => entry.definition_refs?.tool === 'ad_studio_landing_page_results')).toBe(true);
  });

  it('an unconfigured warehouse, a failed query and an exhausted quota each come back as their own state', async () => {
    const { owner, orgId, projectId } = await setup();
    const base = { organizationId: orgId, projectId, environmentId: 'env-prod', since: '2026-06-29' };
    expect(await getLandingPageResults({ ...base, executor: new NotConfiguredWarehouseQueryExecutor() })).toEqual({ status: 'not_configured' });
    expect(await getLandingPageResults({ ...base, executor: { execute: () => Promise.reject(new WarehouseQueryFailedError('Table not found: fact_landing_page_performance')) } })).toEqual({
      status: 'error',
      message: 'Table not found: fact_landing_page_performance',
    });

    await setProjectCostQuota({ organizationId: orgId, projectId, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });
    const { executor } = fakeExecutor([]);
    await getLandingPageResults({ ...base, executor });
    expect(await getLandingPageResults({ ...base, executor })).toEqual({ status: 'quota_exceeded', message: expect.any(String) });
  });
});
