import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  checkFirmographicCompositionAlertsForProject,
  createOrganizationWithOwner,
  createProject,
  ensureFirmographicPackRegistered,
  ensureFirmographicSchemaRegistered,
  ensureUserForFirebaseSession,
  getFirmographicCompositionDimensionBreakdownForProject,
  getFirmographicIndustryBreakdownForProject,
  InMemoryMetricQueryResultCache,
  listActiveFirmographicCompositionAlertsForProject,
  ProjectNotFoundError,
  RawRecordModel,
  type WarehouseQueryExecutor,
  type WarehouseRow,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-87's `ensureFirmographicSchemaRegistered`/
 * `getFirmographicIndustryBreakdownForProject`/
 * `getFirmographicCompositionDimensionBreakdownForProject`/
 * `checkFirmographicCompositionAlertsForProject`. Raw records are landed
 * directly via `RawRecordModel`, same posture `churn-reason.emulator.test.ts`
 * (KAN-84) establishes for its own reads.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('firmographic-service-tests');
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

async function landFirmographicProfile(params: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  industry?: string;
  landedAt: string;
}): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = 'company_firmographic';
  record.client_id = unique('client');
  const properties: Record<string, unknown> = { company_name: 'Acme Corp', employee_count_range: '11-50', region: 'north_america' };
  if (params.industry !== undefined) properties.industry = params.industry;
  record.payload = { event: 'company_firmographic', event_id: unique('event'), ts: params.landedAt, properties };
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

describe('ensureFirmographicSchemaRegistered', () => {
  it('registers the company_firmographic event schema with the right fields', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Firmographic Schema Org');
    const result = await ensureFirmographicSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    expect(result.registered).toBe(true);
    expect(result.schemaDef.field_defs.map((field) => field.name)).toEqual(['company_name', 'company_domain', 'employee_count_range', 'region', 'industry']);
    expect(result.schemaDef.field_defs.every((field) => field.is_pii === false)).toBe(true);
  });

  it('is idempotent: a second call is a no-op and reports registered: false', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Firmographic Schema Idempotent Org');
    await ensureFirmographicSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    const second = await ensureFirmographicSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    expect(second.registered).toBe(false);
  });
});

describe('getFirmographicIndustryBreakdownForProject', () => {
  it('counts each landed industry, ignoring malformed records', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Industry Breakdown Org');
    await ensureFirmographicSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    await landFirmographicProfile({ organizationId: organization.id, projectId: project.id, environmentId, industry: 'saas_software', landedAt: '2026-06-01T09:00:00.000Z' });
    await landFirmographicProfile({ organizationId: organization.id, projectId: project.id, environmentId, industry: 'saas_software', landedAt: '2026-06-02T09:00:00.000Z' });
    await landFirmographicProfile({ organizationId: organization.id, projectId: project.id, environmentId, industry: 'healthcare', landedAt: '2026-06-03T09:00:00.000Z' });
    // Malformed: no industry at all -- must be ignored, not crash the read.
    await landFirmographicProfile({ organizationId: organization.id, projectId: project.id, environmentId, landedAt: '2026-06-04T09:00:00.000Z' });

    const breakdown = await getFirmographicIndustryBreakdownForProject(organization.id, project.id);

    expect(breakdown).toEqual([
      { industry: 'saas_software', count: 2 },
      { industry: 'healthcare', count: 1 },
    ]);
  });

  it('throws ProjectNotFoundError for a project id that does not exist', async () => {
    const { organization } = await setupOrgWithProject('Industry Breakdown Wrong Org');
    await expect(getFirmographicIndustryBreakdownForProject(organization.id, unique('nonexistent-project'))).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

class StaticWarehouseQueryExecutor implements WarehouseQueryExecutor {
  constructor(private readonly rows: WarehouseRow[]) {}
  execute(): Promise<WarehouseRow[]> {
    return Promise.resolve(this.rows);
  }
}

/** Distinguishes the "current" window's compiled query from the "baseline" one by which of the two windows' own `start` bound param it carries — same technique `checkQualityMixAlertsForProject`'s own emulator test (KAN-83) uses, since both queries share identical metric names/dimensions. */
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

describe('getFirmographicCompositionDimensionBreakdownForProject', () => {
  it('degrades to a "warehouse not configured" outcome when no BigQuery project is wired up (buildable-today default)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Composition Breakdown Org');
    await ensureFirmographicPackRegistered(organization.id, project.id, owner.id);

    const outcome = await getFirmographicCompositionDimensionBreakdownForProject(organization.id, project.id, 'industry');

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "query error" outcome when the pack metrics are not registered yet', async () => {
    const { organization, project } = await setupOrgWithProject('Composition Breakdown Unregistered Org');

    const outcome = await getFirmographicCompositionDimensionBreakdownForProject(organization.id, project.id, 'industry');

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('query_error');
  });

  it('returns both the count (#) and mrr ($) series for the requested dimension when a warehouse executor is wired in', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Composition Breakdown Rows Org');
    await ensureFirmographicPackRegistered(organization.id, project.id, owner.id);

    const rows: WarehouseRow[] = [
      { industry: 'saas_software', firmographic_profiles_total: 3, firmographic_mrr_total: 900 },
      { industry: 'healthcare', firmographic_profiles_total: 1, firmographic_mrr_total: 200 },
    ];
    const outcome = await getFirmographicCompositionDimensionBreakdownForProject(organization.id, project.id, 'industry', {
      executor: new StaticWarehouseQueryExecutor(rows),
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('unreachable');
    expect(outcome.rows).toEqual(rows);
  });
});

describe('checkFirmographicCompositionAlertsForProject', () => {
  it('degrades to a "warehouse not configured" outcome by default, touching no alert state', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Check Degrade Org');
    await ensureFirmographicPackRegistered(organization.id, project.id, owner.id);
    const outcome = await checkFirmographicCompositionAlertsForProject({ organizationId: organization.id, projectId: project.id });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('fires a fresh episode for an industry whose share shifted past the fire threshold with enough samples in both windows', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Check Fire Org');
    await ensureFirmographicPackRegistered(organization.id, project.id, owner.id);
    const now = Date.parse('2026-09-15T00:00:00.000Z');
    // Window boundaries `checkFirmographicCompositionAlertsForProject` itself computes (14-day windows): baseline starts 28 days back.
    const baselineStartDate = new Date(now - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Baseline: saas_software 8, healthcare 2 (total 10) -> saas share 0.8.
    // Current: saas_software 3, healthcare 7 (total 10) -> saas share 0.3. Delta 0.5 >= fire threshold (0.15).
    const executor = new WindowAwareWarehouseQueryExecutor(
      baselineStartDate,
      [
        { industry: 'saas_software', firmographic_profiles_total: 8 },
        { industry: 'healthcare', firmographic_profiles_total: 2 },
      ],
      [
        { industry: 'saas_software', firmographic_profiles_total: 3 },
        { industry: 'healthcare', firmographic_profiles_total: 7 },
      ],
    );

    const outcome = await checkFirmographicCompositionAlertsForProject({
      organizationId: organization.id,
      projectId: project.id,
      now,
      triggeredByUserId: unique('user'),
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('unreachable');
    expect(outcome.industries).toEqual([
      expect.objectContaining({ industry: 'healthcare', action: 'fire' }),
      expect.objectContaining({ industry: 'saas_software', action: 'fire' }),
    ]);

    const activeAlerts = await listActiveFirmographicCompositionAlertsForProject(organization.id, project.id);
    expect(activeAlerts).toHaveLength(2);
    const bySaas = activeAlerts.find((alert) => alert.industry === 'saas_software');
    expect(bySaas?.baseline_share).toBeCloseTo(0.8);
    expect(bySaas?.current_share).toBeCloseTo(0.3);
    expect(bySaas?.delta).toBeCloseTo(0.5);
  });

  it('does not fire when both windows have too few total samples (insufficient_data)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Check Insufficient Org');
    await ensureFirmographicPackRegistered(organization.id, project.id, owner.id);
    const now = Date.parse('2026-09-15T00:00:00.000Z');
    const baselineStartDate = new Date(now - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const executor = new WindowAwareWarehouseQueryExecutor(
      baselineStartDate,
      [{ industry: 'saas_software', firmographic_profiles_total: 1 }],
      [{ industry: 'saas_software', firmographic_profiles_total: 1 }],
    );

    const outcome = await checkFirmographicCompositionAlertsForProject({
      organizationId: organization.id,
      projectId: project.id,
      now,
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('unreachable');
    expect(outcome.industries).toEqual([expect.objectContaining({ industry: 'saas_software', action: 'insufficient_data' })]);

    const activeAlerts = await listActiveFirmographicCompositionAlertsForProject(organization.id, project.id);
    expect(activeAlerts).toHaveLength(0);
  });

  it('resolves an already-active episode once the industry share recovers past the resolve threshold', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Check Resolve Org');
    await ensureFirmographicPackRegistered(organization.id, project.id, owner.id);
    const firstCheckNow = Date.parse('2026-09-15T00:00:00.000Z');
    const firstBaselineStartDate = new Date(firstCheckNow - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // First check: fires (same shape as the "fire" test above).
    await checkFirmographicCompositionAlertsForProject({
      organizationId: organization.id,
      projectId: project.id,
      now: firstCheckNow,
      executor: new WindowAwareWarehouseQueryExecutor(
        firstBaselineStartDate,
        [
          { industry: 'saas_software', firmographic_profiles_total: 8 },
          { industry: 'healthcare', firmographic_profiles_total: 2 },
        ],
        [
          { industry: 'saas_software', firmographic_profiles_total: 3 },
          { industry: 'healthcare', firmographic_profiles_total: 7 },
        ],
      ),
      cache: new InMemoryMetricQueryResultCache(),
    });

    const secondCheckNow = Date.parse('2026-09-29T00:00:00.000Z');
    const secondBaselineStartDate = new Date(secondCheckNow - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Second check: saas share settles at baseline 0.5 vs current 0.55 -- delta 0.05 < resolve threshold (0.08).
    const outcome = await checkFirmographicCompositionAlertsForProject({
      organizationId: organization.id,
      projectId: project.id,
      now: secondCheckNow,
      executor: new WindowAwareWarehouseQueryExecutor(
        secondBaselineStartDate,
        [
          { industry: 'saas_software', firmographic_profiles_total: 10 },
          { industry: 'healthcare', firmographic_profiles_total: 10 },
        ],
        [
          { industry: 'saas_software', firmographic_profiles_total: 11 },
          { industry: 'healthcare', firmographic_profiles_total: 9 },
        ],
      ),
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('unreachable');
    const saasOutcome = outcome.industries.find((entry) => entry.industry === 'saas_software');
    expect(saasOutcome?.action).toBe('resolve');

    const activeAlerts = await listActiveFirmographicCompositionAlertsForProject(organization.id, project.id);
    expect(activeAlerts.find((alert) => alert.industry === 'saas_software')).toBeUndefined();
  });
});
