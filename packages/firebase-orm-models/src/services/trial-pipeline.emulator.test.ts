import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getTrialPipelineSummary,
  InMemoryMetricQueryResultCache,
  registerMetricDefinition,
  setProjectCostQuota,
  type WarehouseQueryExecutor,
  type WarehouseRow,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-66's trial-pipeline war-room widget query —
 * mirrors `board.emulator.test.ts`'s own `queryBoardTile` coverage (same
 * degrade-to-outcome posture, same fake-executor pattern), scoped to the
 * fixed `trials_active`/`trial_conversion_rate` pair this widget always asks
 * for.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('trial-pipeline-tests');
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

async function registerTrialPipelineMetrics(organizationId: string, projectId: string, createdByUserId: string) {
  await registerMetricDefinition({
    organizationId,
    projectId,
    name: 'trials_active',
    definition: {
      kind: 'aggregation',
      aggregation: { function: 'count_distinct', table: 'dim_subscription', column: 'subscription_id', timeColumn: 'started_at', filters: [{ field: 'status', operator: '=', value: 'trialing' }] },
    },
    dimensions: [],
    createdByUserId,
  });
  await registerMetricDefinition({
    organizationId,
    projectId,
    name: 'trial_starts',
    definition: {
      kind: 'aggregation',
      aggregation: { function: 'count_distinct', table: 'fact_subscription_event', column: 'subscription_id', timeColumn: 'ts', filters: [{ field: 'type', operator: '=', value: 'trial_start' }] },
    },
    dimensions: [],
    createdByUserId,
  });
  await registerMetricDefinition({
    organizationId,
    projectId,
    name: 'trial_conversions',
    definition: {
      kind: 'aggregation',
      aggregation: { function: 'count_distinct', table: 'fact_subscription_event', column: 'subscription_id', timeColumn: 'ts', filters: [{ field: 'type', operator: '=', value: 'convert' }] },
    },
    dimensions: [],
    createdByUserId,
  });
  await registerMetricDefinition({
    organizationId,
    projectId,
    name: 'trial_conversion_rate',
    definition: { kind: 'formula', formula: 'trial_conversions / trial_starts' },
    dimensions: [],
    createdByUserId,
  });
}

class FakeWarehouseQueryExecutor implements WarehouseQueryExecutor {
  public callCount = 0;
  constructor(private readonly rows: WarehouseRow[]) {}
  execute(): Promise<WarehouseRow[]> {
    this.callCount += 1;
    return Promise.resolve(this.rows);
  }
}

describe('getTrialPipelineSummary', () => {
  it('returns the executor\'s series for the trials_active/trial_conversion_rate pair', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Trial Pipeline Query Org');
    await registerTrialPipelineMetrics(organization.id, project.id, owner.id);
    const rows: WarehouseRow[] = [{ bucket_date: '2026-07-11', trials_active: 42, trial_conversion_rate: 0.2 }];
    const executor = new FakeWarehouseQueryExecutor(rows);

    const outcome = await getTrialPipelineSummary({
      organizationId: organization.id,
      projectId: project.id,
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome).toEqual({ ok: true, series: rows });
    expect(executor.callCount).toBe(1);
  });

  it('degrades to a "warehouse not configured" outcome instead of throwing, using the default executor', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Trial Pipeline Unconfigured Org');
    await registerTrialPipelineMetrics(organization.id, project.id, owner.id);

    const outcome = await getTrialPipelineSummary({
      organizationId: organization.id,
      projectId: project.id,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "query error" outcome when the SaaS pack was never installed (metric not registered)', async () => {
    const { organization, project } = await setupOrgWithProject('Trial Pipeline Not Registered Org');

    const outcome = await getTrialPipelineSummary({
      organizationId: organization.id,
      projectId: project.id,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('query_error');
  });

  it('degrades to a "quota exceeded" outcome once the project\'s daily quota is spent', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Trial Pipeline Quota Org');
    await registerTrialPipelineMetrics(organization.id, project.id, owner.id);
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });

    const cache = new InMemoryMetricQueryResultCache();
    const first = await getTrialPipelineSummary({
      organizationId: organization.id,
      projectId: project.id,
      executor: new FakeWarehouseQueryExecutor([{ bucket_date: '2026-07-11', trials_active: 1, trial_conversion_rate: 0.5 }]),
      cache,
    });
    expect(first.ok).toBe(true);

    const second = await getTrialPipelineSummary({
      organizationId: organization.id,
      projectId: project.id,
      executor: new FakeWarehouseQueryExecutor([{ bucket_date: '2026-07-12', trials_active: 2, trial_conversion_rate: 0.5 }]),
      cache: new InMemoryMetricQueryResultCache(), // a fresh cache, so this genuinely re-checks the quota rather than serving a cache hit
    });
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toBe('quota_exceeded');
  });
});
