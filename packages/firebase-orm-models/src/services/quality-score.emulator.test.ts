import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  checkQualityMixAlertsForProject,
  createOrganizationWithOwner,
  createProject,
  ensureQualityScorePackRegistered,
  ensureUserForFirebaseSession,
  getSignupQualityScoreAdjustedMetricsForProject,
  getSignupQualityScoreDimensionBreakdownForProject,
  getSignupQualityScoreOverviewForProject,
  InMemoryMetricQueryResultCache,
  listActiveQualityMixAlertsForProject,
  ProjectNotFoundError,
  RawRecordModel,
  type WarehouseQueryExecutor,
  type WarehouseRow,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-83's `getSignupQualityScoreOverviewForProject`/
 * `getSignupQualityScoreDimensionBreakdownForProject`/
 * `getSignupQualityScoreAdjustedMetricsForProject`/`checkQualityMixAlertsForProject`.
 * Raw records are landed directly via `RawRecordModel`, same posture
 * `churn-reason.emulator.test.ts` (KAN-84) establishes for its own reads.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('quality-score-service-tests');
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
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const devEnvironment = environments.find((environment) => environment.name === 'dev')!;
  return { owner, organization, project, environmentId: devEnvironment.id };
}

async function landOnboardingSurvey(params: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  qualityScore?: number | string;
  landedAt: string;
}): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = 'onboarding_survey';
  record.client_id = unique('client');
  const properties: Record<string, unknown> = { company_size: '11-50', budget_range: '1k_10k', urgency: 'this_quarter' };
  if (params.qualityScore !== undefined) properties.quality_score = params.qualityScore;
  record.payload = { event: 'onboarding_survey', event_id: unique('event'), ts: params.landedAt, properties };
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

describe('getSignupQualityScoreOverviewForProject', () => {
  it('buckets landed quality scores into low/medium/high and computes the average, ignoring malformed records', async () => {
    const { organization, project, environmentId } = await setupOrgWithProject('Overview Org');

    await landOnboardingSurvey({ organizationId: organization.id, projectId: project.id, environmentId, qualityScore: 12, landedAt: '2026-06-01T09:00:00.000Z' });
    await landOnboardingSurvey({ organizationId: organization.id, projectId: project.id, environmentId, qualityScore: 90, landedAt: '2026-06-02T09:00:00.000Z' });
    // Malformed: no quality_score at all -- must be ignored, not crash the read.
    await landOnboardingSurvey({ organizationId: organization.id, projectId: project.id, environmentId, landedAt: '2026-06-03T09:00:00.000Z' });

    const overview = await getSignupQualityScoreOverviewForProject(organization.id, project.id);

    expect(overview.totalResponses).toBe(2);
    expect(overview.low).toBe(1);
    expect(overview.high).toBe(1);
    expect(overview.averageScore).toBeCloseTo(51, 10);
  });

  it('throws ProjectNotFoundError for a project id that does not exist', async () => {
    const { organization } = await setupOrgWithProject('Overview Wrong Org');
    await expect(getSignupQualityScoreOverviewForProject(organization.id, unique('nonexistent-project'))).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe('getSignupQualityScoreDimensionBreakdownForProject', () => {
  it('degrades to a "warehouse not configured" outcome when no BigQuery project is wired up (buildable-today default)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Dimension Breakdown Org');
    await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);
    const outcome = await getSignupQualityScoreDimensionBreakdownForProject(organization.id, project.id, 'channel_id');
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "query error" outcome when the underlying metrics are not registered yet', async () => {
    const { organization, project } = await setupOrgWithProject('Dimension Breakdown Unregistered Org');
    const outcome = await getSignupQualityScoreDimensionBreakdownForProject(organization.id, project.id, 'channel_id');
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('query_error');
  });
});

describe('getSignupQualityScoreAdjustedMetricsForProject', () => {
  it('degrades to a "warehouse not configured" outcome by default', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Adjusted Metrics Org');
    await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);
    const outcome = await getSignupQualityScoreAdjustedMetricsForProject(organization.id, project.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('reads both ratios straight off the compiled query row when a warehouse executor is wired up', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Adjusted Metrics Wired Org');
    await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);
    const executor = new StaticWarehouseQueryExecutor([{ quality_adjusted_cost_per_signup: 12.5, quality_adjusted_cac: 40.25 }]);

    const outcome = await getSignupQualityScoreAdjustedMetricsForProject(organization.id, project.id, { executor, cache: new InMemoryMetricQueryResultCache() });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('unreachable');
    expect(outcome.metrics).toEqual({ costPerSignup: 12.5, cac: 40.25 });
  });

  it('reports null for either ratio when the series comes back empty (e.g. zero signups in the window)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Adjusted Metrics Empty Org');
    await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);
    const executor = new StaticWarehouseQueryExecutor([]);

    const outcome = await getSignupQualityScoreAdjustedMetricsForProject(organization.id, project.id, { executor, cache: new InMemoryMetricQueryResultCache() });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('unreachable');
    expect(outcome.metrics).toEqual({ costPerSignup: null, cac: null });
  });
});

class StaticWarehouseQueryExecutor implements WarehouseQueryExecutor {
  constructor(private readonly rows: WarehouseRow[]) {}
  execute(): Promise<WarehouseRow[]> {
    return Promise.resolve(this.rows);
  }
}

/** A fake executor for `checkQualityMixAlertsForProject`'s two-window check: returns different canned rows depending on which of the two windows' own `start` bound param the compiled query carries — the only thing that reliably distinguishes the "current" query from the "baseline" one (both share the same metric names/dimensions). */
class WindowAwareWarehouseQueryExecutor implements WarehouseQueryExecutor {
  constructor(
    private readonly baselineStartDate: string,
    private readonly baselineRows: WarehouseRow[],
    private readonly currentRows: WarehouseRow[],
  ) {}
  execute(query: { params: Record<string, unknown> }): Promise<WarehouseRow[]> {
    const isBaseline = Object.values(query.params).some((value) => typeof value === 'string' && value.startsWith(this.baselineStartDate));
    return Promise.resolve(isBaseline ? this.baselineRows : this.currentRows);
  }
}

describe('checkQualityMixAlertsForProject', () => {
  it('degrades to a "warehouse not configured" outcome by default, touching no alert state', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Check Degrade Org');
    await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);
    const outcome = await checkQualityMixAlertsForProject({ organizationId: organization.id, projectId: project.id });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "query error" outcome when the underlying metrics are not registered yet', async () => {
    const { organization, project } = await setupOrgWithProject('Check Unregistered Org');
    const outcome = await checkQualityMixAlertsForProject({ organizationId: organization.id, projectId: project.id });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('query_error');
  });

  it('fires a fresh episode for a channel whose quality dropped past the fire threshold with enough samples in both windows', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Check Fire Org');
    await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);
    const now = Date.parse('2026-09-15T00:00:00.000Z');
    // Window boundaries `checkQualityMixAlertsForProject` itself computes (14-day windows): baseline starts 28 days back.
    const baselineStartDate = new Date(now - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const executor = new WindowAwareWarehouseQueryExecutor(
      baselineStartDate,
      [{ channel_id: 'paid_social', signup_quality_score_sum: 400, signups_scored: 5 }], // baseline avg 80
      [{ channel_id: 'paid_social', signup_quality_score_sum: 250, signups_scored: 5 }], // current avg 50, delta 30 >= fire threshold (15)
    );

    const outcome = await checkQualityMixAlertsForProject({
      organizationId: organization.id,
      projectId: project.id,
      now,
      triggeredByUserId: unique('user'),
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('unreachable');
    expect(outcome.channels).toEqual([
      expect.objectContaining({ channelId: 'paid_social', action: 'fire', baselineAvgScore: 80, currentAvgScore: 50 }),
    ]);

    const activeAlerts = await listActiveQualityMixAlertsForProject(organization.id, project.id);
    expect(activeAlerts).toHaveLength(1);
    expect(activeAlerts[0].channel_id).toBe('paid_social');
    expect(activeAlerts[0].delta).toBe(30);
  });

  it('does not fire when both windows have too few samples (insufficient_data)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Check Insufficient Org');
    await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);
    const now = Date.parse('2026-09-15T00:00:00.000Z');
    const baselineStartDate = new Date(now - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const executor = new WindowAwareWarehouseQueryExecutor(
      baselineStartDate,
      [{ channel_id: 'organic', signup_quality_score_sum: 80, signups_scored: 1 }],
      [{ channel_id: 'organic', signup_quality_score_sum: 10, signups_scored: 1 }],
    );

    const outcome = await checkQualityMixAlertsForProject({
      organizationId: organization.id,
      projectId: project.id,
      now,
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('unreachable');
    expect(outcome.channels).toEqual([expect.objectContaining({ channelId: 'organic', action: 'insufficient_data' })]);

    const activeAlerts = await listActiveQualityMixAlertsForProject(organization.id, project.id);
    expect(activeAlerts).toHaveLength(0);
  });

  it('resolves an already-active episode once the channel recovers past the resolve threshold', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Check Resolve Org');
    await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);
    const firstCheckNow = Date.parse('2026-09-15T00:00:00.000Z');
    const firstBaselineStartDate = new Date(firstCheckNow - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // First check: fires (same shape as the "fire" test above).
    await checkQualityMixAlertsForProject({
      organizationId: organization.id,
      projectId: project.id,
      now: firstCheckNow,
      executor: new WindowAwareWarehouseQueryExecutor(
        firstBaselineStartDate,
        [{ channel_id: 'paid_social', signup_quality_score_sum: 400, signups_scored: 5 }],
        [{ channel_id: 'paid_social', signup_quality_score_sum: 250, signups_scored: 5 }],
      ),
      cache: new InMemoryMetricQueryResultCache(),
    });
    expect((await listActiveQualityMixAlertsForProject(organization.id, project.id))).toHaveLength(1);

    // Second check, two weeks later: the channel has fully recovered.
    const secondCheckNow = Date.parse('2026-09-29T00:00:00.000Z');
    const secondBaselineStartDate = new Date(secondCheckNow - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const outcome = await checkQualityMixAlertsForProject({
      organizationId: organization.id,
      projectId: project.id,
      now: secondCheckNow,
      executor: new WindowAwareWarehouseQueryExecutor(
        secondBaselineStartDate,
        [{ channel_id: 'paid_social', signup_quality_score_sum: 250, signups_scored: 5 }], // baseline avg 50
        [{ channel_id: 'paid_social', signup_quality_score_sum: 400, signups_scored: 5 }], // current avg 80, delta -30 (recovered)
      ),
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('unreachable');
    expect(outcome.channels).toEqual([expect.objectContaining({ channelId: 'paid_social', action: 'resolve' })]);

    expect((await listActiveQualityMixAlertsForProject(organization.id, project.id))).toHaveLength(0);
  });

  it('throws ProjectNotFoundError for a project id that does not exist', async () => {
    const { organization } = await setupOrgWithProject('Check Wrong Org');
    await expect(checkQualityMixAlertsForProject({ organizationId: organization.id, projectId: unique('nonexistent-project') })).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });
});
