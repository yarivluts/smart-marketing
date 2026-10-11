import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, getCustomerEntityCoverage, listQueryCostLogEntriesForProject, setProjectCostQuota } from '../index';
import { NotConfiguredWarehouseQueryExecutor, WarehouseQueryFailedError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * `getCustomerEntityCoverage` runs behind `runQuotaGatedWarehouseQuery`, which reads the project and
 * its daily cost quota from Firestore on every call - hence the emulator. The SQL itself is proven
 * on DuckDB in `customer-coverage.duckdb.test.ts`.
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
  await connectToFirestoreEmulator('customer-coverage-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setupOrgWithProject() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Coverage Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

describe('getCustomerEntityCoverage', () => {
  it('returns the counts, scoped to the org, project, environment and customer schemas, and logs the query cost', async () => {
    const { organization, project } = await setupOrgWithProject();
    const { executor, calls } = fakeExecutor([{ event_customers: 100, with_customer_record: 5 }]);
    const result = await getCustomerEntityCoverage({ organizationId: organization.id, projectId: project.id, environmentId: 'env-dev', customerEntitySchemas: ['customer'], executor });

    expect(result).toEqual({ status: 'ok', coverage: { eventCustomers: 100, withCustomerRecord: 5 } });
    expect(calls[0].params).toEqual({ organizationId: organization.id, projectId: project.id, environmentId: 'env-dev', customerSchema0: 'customer' });
    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries.some((entry) => entry.definition_refs?.tool === 'customer_entity_coverage')).toBe(true);
  });

  it('reads an empty result as zero customers', async () => {
    const { organization, project } = await setupOrgWithProject();
    const result = await getCustomerEntityCoverage({ organizationId: organization.id, projectId: project.id, environmentId: 'env-dev', customerEntitySchemas: [], executor: fakeExecutor([]).executor });
    expect(result).toEqual({ status: 'ok', coverage: { eventCustomers: 0, withCustomerRecord: 0 } });
  });

  it('an unconfigured warehouse, a failed query and an exhausted quota each come back as a state, not a throw', async () => {
    const { owner, organization, project } = await setupOrgWithProject();
    const base = { organizationId: organization.id, projectId: project.id, environmentId: 'env-dev', customerEntitySchemas: ['customer'] };

    expect(await getCustomerEntityCoverage({ ...base, executor: new NotConfiguredWarehouseQueryExecutor() })).toEqual({ status: 'not_configured' });
    expect(
      await getCustomerEntityCoverage({ ...base, executor: { execute: () => Promise.reject(new WarehouseQueryFailedError('BigQuery rejected the compiled metric query: boom')) } }),
    ).toEqual({ status: 'error', message: 'BigQuery rejected the compiled metric query: boom' });

    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });
    const { executor } = fakeExecutor([{ event_customers: 1, with_customer_record: 1 }]);
    await getCustomerEntityCoverage({ ...base, executor });
    expect(await getCustomerEntityCoverage({ ...base, executor })).toEqual({ status: 'error', message: expect.any(String) });
  });
});
