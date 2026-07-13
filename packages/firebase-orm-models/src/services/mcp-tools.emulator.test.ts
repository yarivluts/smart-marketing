import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  InvalidMcpToolRequestError,
  listProjectInsights,
  queryProjectCohortRetention,
  searchProjectCustomers,
  TrackingAlertModel,
  WinEventModel,
  type WarehouseQueryExecutor,
  type WarehouseRow,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Tests for KAN-75's MCP-tool data adapters: `search_customers`/`query_cohort` (hand-written SQL through a fake `WarehouseQueryExecutor`) and `list_insights` (a real Firestore fan-out over tracking alerts + win events). */

beforeAll(async () => {
  await connectToFirestoreEmulator('mcp-tools-service-tests');
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

class FakeWarehouseQueryExecutor implements WarehouseQueryExecutor {
  public calls: Array<{ sql: string; params: Record<string, unknown> }> = [];
  constructor(private readonly rows: WarehouseRow[]) {}
  execute(query: { sql: string; params: Record<string, unknown> }): Promise<WarehouseRow[]> {
    this.calls.push(query);
    return Promise.resolve(this.rows);
  }
}

describe('searchProjectCustomers', () => {
  it('builds a parameterized search query against entities and maps rows, parsing JSON properties', async () => {
    const { organization, project } = await setupOrgWithProject('Search Customers Org');
    const executor = new FakeWarehouseQueryExecutor([
      { entity_id: 'cust_1', schema_name: 'customer', properties: '{"email":"a@example.com"}', last_seen_at: '2026-07-10T00:00:00Z' },
    ]);

    const results = await searchProjectCustomers({
      organizationId: organization.id,
      projectId: project.id,
      query: 'a@example.com',
      executor,
    });

    expect(results).toEqual([
      { entityId: 'cust_1', schemaName: 'customer', properties: { email: 'a@example.com' }, lastSeenAt: '2026-07-10T00:00:00Z' },
    ]);
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0].sql).toContain('FROM entities');
    expect(executor.calls[0].sql).toContain('entity_id LIKE @likeQuery');
    expect(executor.calls[0].params.likeQuery).toBe('%a@example.com%');
    expect(executor.calls[0].params).not.toHaveProperty('schemaName');
  });

  it('adds a schema_name filter when provided', async () => {
    const { organization, project } = await setupOrgWithProject('Search Customers Schema Org');
    const executor = new FakeWarehouseQueryExecutor([]);

    await searchProjectCustomers({ organizationId: organization.id, projectId: project.id, query: 'x', schemaName: 'lead', executor });

    expect(executor.calls[0].sql).toContain('schema_name = @schemaName');
    expect(executor.calls[0].params.schemaName).toBe('lead');
  });

  it('escapes LIKE wildcard metacharacters in the search term so % and _ match literally, not as wildcards', async () => {
    const { organization, project } = await setupOrgWithProject('Search Customers Escaping Org');
    const executor = new FakeWarehouseQueryExecutor([]);

    await searchProjectCustomers({ organizationId: organization.id, projectId: project.id, query: '50%_off\\deal', executor });

    expect(executor.calls[0].params.likeQuery).toBe('%50\\%\\_off\\\\deal%');
  });

  it('rejects an empty query without ever calling the executor', async () => {
    const { organization, project } = await setupOrgWithProject('Search Customers Empty Org');
    const executor = new FakeWarehouseQueryExecutor([]);

    await expect(
      searchProjectCustomers({ organizationId: organization.id, projectId: project.id, query: '   ', executor }),
    ).rejects.toBeInstanceOf(InvalidMcpToolRequestError);
    expect(executor.calls).toHaveLength(0);
  });

  it('falls back to the raw string when properties is not valid JSON', async () => {
    const { organization, project } = await setupOrgWithProject('Search Customers Bad JSON Org');
    const executor = new FakeWarehouseQueryExecutor([
      { entity_id: 'cust_2', schema_name: 'customer', properties: 'not-json', last_seen_at: '2026-07-10T00:00:00Z' },
    ]);

    const results = await searchProjectCustomers({ organizationId: organization.id, projectId: project.id, query: 'cust', executor });
    expect(results[0].properties).toBe('not-json');
  });
});

describe('queryProjectCohortRetention', () => {
  it('builds a parameterized retention-matrix query and maps numeric columns', async () => {
    const { organization, project } = await setupOrgWithProject('Cohort Org');
    const executor = new FakeWarehouseQueryExecutor([
      { cohort_month: '2026-01-01', period_number: 0, cohort_size: 100, retained_count: 100, retention_rate: 1 },
      { cohort_month: '2026-01-01', period_number: 1, cohort_size: 100, retained_count: 40, retention_rate: 0.4 },
    ]);

    const rows = await queryProjectCohortRetention({ organizationId: organization.id, projectId: project.id, executor });

    expect(rows).toEqual([
      { cohortMonth: '2026-01-01', periodNumber: 0, cohortSize: 100, retainedCount: 100, retentionRate: 1 },
      { cohortMonth: '2026-01-01', periodNumber: 1, cohortSize: 100, retainedCount: 40, retentionRate: 0.4 },
    ]);
    expect(executor.calls[0].sql).toContain('FROM fact_cohort_retention');
    expect(executor.calls[0].params).not.toHaveProperty('cohortMonth');
  });

  it('adds a cohort_month filter when provided', async () => {
    const { organization, project } = await setupOrgWithProject('Cohort Filtered Org');
    const executor = new FakeWarehouseQueryExecutor([]);

    await queryProjectCohortRetention({ organizationId: organization.id, projectId: project.id, cohortMonth: '2026-02-01', executor });

    expect(executor.calls[0].sql).toContain('cohort_month = @cohortMonth');
    expect(executor.calls[0].params.cohortMonth).toBe('2026-02-01');
  });
});

describe('listProjectInsights', () => {
  it('returns an empty list for a project with no alerts or wins', async () => {
    const { organization, project } = await setupOrgWithProject('Empty Insights Org');
    const insights = await listProjectInsights({ organizationId: organization.id, projectId: project.id });
    expect(insights).toEqual([]);
  });

  it('merges active tracking alerts and recent win events, newest first', async () => {
    const { organization, project } = await setupOrgWithProject('Merged Insights Org');

    const alert = new TrackingAlertModel();
    alert.organization_id = organization.id;
    alert.project_id = project.id;
    alert.schema_name = 'checkout_completed';
    alert.status = 'active';
    alert.trigger = 'manual';
    alert.detected_at = '2026-07-12T00:00:00.000Z';
    alert.last_seen_at = '2026-07-11T00:00:00.000Z';
    alert.last_checked_at = '2026-07-12T00:00:00.000Z';
    alert.setPathParams({ organization_id: organization.id, project_id: project.id });
    await alert.save();

    const win = new WinEventModel();
    win.organization_id = organization.id;
    win.project_id = project.id;
    win.environment_id = 'env-1';
    win.win_rule_id = 'rule-1';
    win.win_rule_name = 'Big order';
    win.win_type = 'generic';
    win.schema_name = 'order_completed';
    win.raw_record_id = 'record-1';
    win.client_id = 'client-1';
    win.payload = { amount: 500 };
    win.occurred_at = '2026-07-13T00:00:00.000Z';
    win.created_at = '2026-07-13T00:00:00.000Z';
    win.setPathParams({ organization_id: organization.id, project_id: project.id });
    await win.save();

    const insights = await listProjectInsights({ organizationId: organization.id, projectId: project.id });

    expect(insights).toHaveLength(2);
    // Newest first: the win (2026-07-13) before the alert (2026-07-12).
    expect(insights[0]).toMatchObject({ kind: 'win_event', id: win.id, severity: 'info' });
    expect(insights[1]).toMatchObject({ kind: 'tracking_alert', id: alert.id, severity: 'warning' });
  });

  it('respects the limit parameter across the merged list', async () => {
    const { organization, project } = await setupOrgWithProject('Limited Insights Org');
    for (let i = 0; i < 3; i += 1) {
      const alert = new TrackingAlertModel();
      alert.organization_id = organization.id;
      alert.project_id = project.id;
      alert.schema_name = `event_${i}`;
      alert.status = 'active';
      alert.trigger = 'manual';
      alert.detected_at = `2026-07-1${i}T00:00:00.000Z`;
      alert.last_seen_at = `2026-07-0${i}T00:00:00.000Z`;
      alert.last_checked_at = `2026-07-1${i}T00:00:00.000Z`;
      alert.setPathParams({ organization_id: organization.id, project_id: project.id });
      await alert.save();
    }

    const insights = await listProjectInsights({ organizationId: organization.id, projectId: project.id, limit: 2 });
    expect(insights).toHaveLength(2);
  });
});
