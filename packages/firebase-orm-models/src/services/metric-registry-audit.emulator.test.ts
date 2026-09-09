import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  archiveMetricDefinition,
  auditMetricCatalogHealth,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getActiveMetricDefinition,
  listAuditLogEntriesForOrg,
  listMetricDefinitionVersions,
  MetricDefNotFoundError,
  registerMetricDefinition,
  type MetricDefinitionInput,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for the EasySign-audit registry work: core-table column validation (P-05), formula operand dimensions (P-06), archive (J-02), and the catalog health sweep (P-03). */

beforeAll(async () => {
  await connectToFirestoreEmulator('metric-registry-audit-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

/** A fixture relation neither registered as a schema nor catalogued as a core table — registration lets it through, the health sweep flags it. */
const fixtureAdSpend: MetricDefinitionInput = {
  kind: 'aggregation',
  aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] },
};

const signups: MetricDefinitionInput = {
  kind: 'aggregation',
  aggregation: { function: 'count_distinct', table: 'fact_funnel_event', column: 'customer_id', timeColumn: 'ts', filters: [{ field: 'step', operator: '=', value: 'signup' }] },
};

describe('registration validation against the dbt core table catalog (P-05)', () => {
  it('rejects a time column / filter field / dimension a core table does not carry', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Registry Core Columns Org');
    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'collected_revenue',
        definition: {
          kind: 'aggregation',
          aggregation: { function: 'sum', table: 'fact_revenue_event', column: 'amount', timeColumn: 'date', filters: [{ field: 'kind', operator: '=', value: 'charge' }] },
        },
        dimensions: ['plan', 'channel_id'],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        reasons: expect.arrayContaining([
          expect.stringContaining('time column "date" does not exist on core table "fact_revenue_event"'),
          expect.stringContaining('Filter field "kind" does not exist on core table "fact_revenue_event"'),
          expect.stringContaining('Dimension "channel_id" does not exist on core table "fact_revenue_event"'),
        ]),
      }),
    );
  });

  it('rejects sum over a non-numeric core column, and any metric on a dbt model the warehouse does not build', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Registry Core Types Org');
    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'bad_sum',
        definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_revenue_event', column: 'type', timeColumn: 'ts', filters: [] } },
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrowError(expect.objectContaining({ reasons: [expect.stringContaining('needs a numeric column, but "type" is of type STRING')] }));

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'funnel_reached',
        definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_funnel_step', timeColumn: 'reached_at', filters: [] } },
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrowError(expect.objectContaining({ reasons: [expect.stringContaining('"fact_funnel_step" is a dbt core model that is not built in the warehouse yet')] }));
  });

  it('accepts a well-formed core-table metric, and still accepts a relation it cannot vouch for', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Registry Core Accept Org');
    const good = await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'collected_revenue',
      definition: {
        kind: 'aggregation',
        aggregation: { function: 'sum', table: 'fact_revenue_event', column: 'amount', timeColumn: 'ts', filters: [{ field: 'type', operator: '=', value: 'charge' }] },
      },
      dimensions: ['plan'],
      createdByUserId: owner.id,
    });
    expect(good.status).toBe('active');

    const external = await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'external_rows',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'externally_provisioned_relation', timeColumn: 'ts', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    expect(external.status).toBe('active');
  });
});

describe('formula operand dimensions (P-06)', () => {
  it('rejects a formula declaring a dimension one of its operands cannot break down by, and accepts the intersection', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Registry Formula Dims Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_attribution', column: 'credit', timeColumn: 'occurred_at', filters: [] } },
      dimensions: ['channel_id', 'campaign_id'],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'new_paying',
      definition: { kind: 'aggregation', aggregation: { function: 'count_distinct', table: 'fact_revenue_event', column: 'customer_id', timeColumn: 'ts', filters: [] } },
      dimensions: ['plan'],
      createdByUserId: owner.id,
    });

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'cac',
        definition: { kind: 'formula', formula: 'ad_spend / new_paying' },
        dimensions: ['channel_id'],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ reasons: [expect.stringContaining('Formula dimension "channel_id" is not declared on referenced metric(s): new_paying')] }),
    );

    const cac = await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'cac',
      definition: { kind: 'formula', formula: 'ad_spend / new_paying' },
      dimensions: [],
      createdByUserId: owner.id,
    });
    expect(cac.definition_kind).toBe('formula');
  });
});

describe('archiveMetricDefinition (J-02)', () => {
  it('archives the active version: it stops resolving, stays on record, is audited, and is refused while a formula references it', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Registry Archive Org');
    await registerMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'ad_spend', definition: fixtureAdSpend, dimensions: [], createdByUserId: owner.id });
    await registerMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'signups', definition: signups, dimensions: [], createdByUserId: owner.id });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'cost_per_signup',
      definition: { kind: 'formula', formula: 'ad_spend / signups' },
      dimensions: [],
      createdByUserId: owner.id,
    });

    await expect(
      archiveMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'ad_spend', archivedByUserId: owner.id }),
    ).rejects.toThrowError(expect.objectContaining({ referencedBy: ['cost_per_signup'] }));

    await archiveMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'cost_per_signup', archivedByUserId: owner.id });
    const archived = await archiveMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'ad_spend', archivedByUserId: owner.id });
    expect(archived.status).toBe('archived');
    expect(await getActiveMetricDefinition(organization.id, project.id, 'ad_spend')).toBeNull();
    const versions = await listMetricDefinitionVersions(organization.id, project.id, 'ad_spend');
    expect(versions.map((version) => version.status)).toEqual(['archived']);

    await expect(
      archiveMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'ad_spend', archivedByUserId: owner.id }),
    ).rejects.toBeInstanceOf(MetricDefNotFoundError);

    const audit = await listAuditLogEntriesForOrg(organization.id);
    expect(audit.some((entry) => entry.action === 'metric_def.archive' && entry.summary.includes('"ad_spend"'))).toBe(true);
  });
});

describe('auditMetricCatalogHealth (P-03)', () => {
  it('flags every active metric registration would reject today (unknown table, stale operand), and stays silent on a healthy catalog', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Registry Health Org');
    await registerMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'ad_spend', definition: fixtureAdSpend, dimensions: [], createdByUserId: owner.id });
    await registerMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'signups', definition: signups, dimensions: [], createdByUserId: owner.id });

    const problems = await auditMetricCatalogHealth(organization.id, project.id);
    expect(problems.map((problem) => problem.name)).toEqual(['ad_spend']);
    expect(problems[0].reasons[0]).toContain('"fact_ad_spend" is neither one of this project');

    await archiveMetricDefinition({ organizationId: organization.id, projectId: project.id, name: 'ad_spend', archivedByUserId: owner.id });
    expect(await auditMetricCatalogHealth(organization.id, project.id)).toEqual([]);
  });
});
