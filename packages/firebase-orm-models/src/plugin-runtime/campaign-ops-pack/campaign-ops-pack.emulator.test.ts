import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getActiveMetricDefinition,
  listMetricDefinitionsForProject,
  registerMetricDefinition,
  type MetricDefModel,
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import { ensureCampaignOpsPackRegistered } from './index';

/** Emulator-backed tests for KAN-86's Campaign Ops pack — mirrors `feedback-pack.emulator.test.ts`'s own shape (one shared registration per describe block, idempotency, project isolation). */

beforeAll(async () => {
  await connectToFirestoreEmulator('campaign-ops-pack-tests');
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

describe('ensureCampaignOpsPackRegistered — metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Campaign Ops Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureCampaignOpsPackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers all four metrics as active v1', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(4);
    expect(defs.every((def) => def.version === 1 && def.status === 'active')).toBe(true);
  });

  it.each([
    ['collection_7d', 'collected_revenue_7d'],
    ['collection_14d', 'collected_revenue_14d'],
    ['collection_30d', 'collected_revenue_30d'],
    ['collection_40d', 'collected_revenue_40d'],
  ])('registers %s: sum(fact_customer_payback.%s)', async (name, column) => {
    const metric = await activeMetric(name);
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'sum',
      table: 'fact_customer_payback',
      column,
      timeColumn: 'acquired_at',
      filters: [],
    });
  });
});

describe('ensureCampaignOpsPackRegistered — idempotency and isolation', () => {
  it('partially idempotent: a metric pre-registered by a human is left alone, the other three still register', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'collection_7d',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'legacy_payback_export', column: 'amount', timeColumn: 'reported_on', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const result = await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['collection_7d']);
    expect(result.registered).toHaveLength(3);
    expect(result.registered).not.toContain('collection_7d');
  });

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toHaveLength(4);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(4);
    expect(defs.every((def) => def.version === 1)).toBe(true);
  });

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'collection_7d');
    expect(metricInOtherProject).toBeNull();
  });
});
