import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getWarehouseFreshnessForProject,
  listQueryCostLogEntriesForProject,
  setProjectCostQuota,
} from '../index';
import { NotConfiguredWarehouseQueryExecutor, WarehouseQueryFailedError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for `getWarehouseFreshnessForProject`: converted from
 * a pure fake-executor suite once the function started running behind
 * `runQuotaGatedWarehouseQuery` (see this file's own PROGRESS.md entry),
 * which reads a real project + its daily cost quota from Firestore on every
 * call regardless of which executor is injected — the same reason
 * `segment.emulator.test.ts`'s `countSegmentMembers` suite needs the
 * emulator too.
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
  await connectToFirestoreEmulator('warehouse-freshness-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

describe('getWarehouseFreshnessForProject', () => {
  it('reads latest landed_at + row count scoped to org/project/environment', async () => {
    const { organization, project } = await setupOrgWithProject('Freshness Ok Org');
    const { executor, calls } = fakeExecutor([{ latest_landed_at: '2026-08-20 03:00:01', landed_record_count: 42 }]);

    const result = await getWarehouseFreshnessForProject({ organizationId: organization.id, projectId: project.id, environmentId: 'env-prod-1', executor });

    expect(result).toEqual({ status: 'ok', latestLandedAt: '2026-08-20 03:00:01', landedRecordCount: 42 });
    expect(calls[0].sql).toContain('FROM stg_raw_records');
    expect(calls[0].sql).toContain('environment_id = @environmentId');
    expect(calls[0].params).toEqual({ organizationId: organization.id, projectId: project.id, environmentId: 'env-prod-1' });
  });

  it('reports zero rows as ok with a null latest timestamp (a fresh project, not an error)', async () => {
    const { organization, project } = await setupOrgWithProject('Freshness Zero Org');
    const { executor } = fakeExecutor([{ latest_landed_at: null, landed_record_count: 0 }]);

    const result = await getWarehouseFreshnessForProject({ organizationId: organization.id, projectId: project.id, environmentId: 'env-prod-1', executor });

    expect(result).toEqual({ status: 'ok', latestLandedAt: null, landedRecordCount: 0 });
  });

  it('maps WarehouseNotConfiguredError to the not_configured state', async () => {
    const { organization, project } = await setupOrgWithProject('Freshness Not Configured Org');

    const result = await getWarehouseFreshnessForProject({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'env-prod-1',
      executor: new NotConfiguredWarehouseQueryExecutor(),
    });

    expect(result).toEqual({ status: 'not_configured' });
  });

  it('maps a warehouse-side rejection to the error state with its message', async () => {
    const { organization, project } = await setupOrgWithProject('Freshness Query Error Org');
    const executor: WarehouseQueryExecutor = {
      execute: () => Promise.reject(new WarehouseQueryFailedError('BigQuery rejected the compiled metric query: boom')),
    };

    const result = await getWarehouseFreshnessForProject({ organizationId: organization.id, projectId: project.id, environmentId: 'env-prod-1', executor });

    expect(result).toEqual({ status: 'error', message: 'BigQuery rejected the compiled metric query: boom' });
  });

  it('rethrows an unrecognized error instead of degrading it into a normal-looking state', async () => {
    const { organization, project } = await setupOrgWithProject('Freshness Unrecognized Error Org');
    const executor: WarehouseQueryExecutor = { execute: () => Promise.reject(new TypeError('coding bug')) };

    await expect(
      getWarehouseFreshnessForProject({ organizationId: organization.id, projectId: project.id, environmentId: 'env-prod-1', executor }),
    ).rejects.toThrow(TypeError);
  });

  it('logs an "executed" cost-log entry against the project\'s daily quota (KAN-39)', async () => {
    const { organization, project } = await setupOrgWithProject('Freshness Quota Log Org');
    const { executor } = fakeExecutor([{ latest_landed_at: null, landed_record_count: 0 }]);

    await getWarehouseFreshnessForProject({ organizationId: organization.id, projectId: project.id, environmentId: 'env-prod-1', executor });

    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe('executed');
    expect(entries[0].definition_refs).toEqual({ tool: 'warehouse_freshness' });
  });

  it('degrades to the "error" state instead of throwing once the project has spent its daily quota', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Freshness Quota Blocked Org');
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });
    const { executor, calls } = fakeExecutor([{ latest_landed_at: null, landed_record_count: 0 }]);

    await getWarehouseFreshnessForProject({ organizationId: organization.id, projectId: project.id, environmentId: 'env-prod-1', executor });
    const result = await getWarehouseFreshnessForProject({ organizationId: organization.id, projectId: project.id, environmentId: 'env-prod-1', executor });

    expect(result).toEqual({ status: 'error', message: expect.any(String) });
    expect(calls).toHaveLength(1);
  });
});
