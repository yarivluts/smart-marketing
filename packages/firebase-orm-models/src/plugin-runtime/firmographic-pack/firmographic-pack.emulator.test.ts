import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getActiveMetricDefinition,
  getActiveSchemaDefinition,
  listMetricDefinitionsForProject,
  registerMetricDefinition,
  type MetricDefModel,
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import { ensureFirmographicPackRegistered } from './index';

/** Emulator-backed tests for KAN-87's Firmographic Enrichment pack — mirrors `churn-reason-pack.emulator.test.ts`'s own shape (one shared registration per describe block, idempotency, project isolation). */

beforeAll(async () => {
  await connectToFirestoreEmulator('firmographic-pack-tests');
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

describe('ensureFirmographicPackRegistered — schema + metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Firmographic Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureFirmographicPackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers the company_firmographic event schema', async () => {
    const schemaDef = await getActiveSchemaDefinition(organizationId, projectId, 'event', 'company_firmographic');
    expect(schemaDef).not.toBeNull();
    expect(schemaDef?.field_defs.map((field) => field.name)).toEqual(['company_name', 'company_domain', 'employee_count_range', 'region', 'industry']);
  });

  it('registers both metrics as active v1, sharing the same industry/employee-count/region dimensions', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(2);
    expect(defs.every((def) => def.version === 1 && def.status === 'active')).toBe(true);

    const countMetric = await activeMetric('firmographic_profiles_total');
    expect(countMetric?.aggregation).toEqual({ function: 'count', table: 'fact_company_firmographic', timeColumn: 'ts', filters: [] });
    expect(countMetric?.dimensions).toEqual(['industry', 'employee_count_range', 'region']);

    const mrrMetric = await activeMetric('firmographic_mrr_total');
    expect(mrrMetric?.aggregation).toEqual({ function: 'sum', table: 'fact_company_firmographic', column: 'mrr', timeColumn: 'ts', filters: [] });
    expect(mrrMetric?.dimensions).toEqual(['industry', 'employee_count_range', 'region']);
  });
});

describe('ensureFirmographicPackRegistered — idempotency and isolation', () => {
  it('partially idempotent: a metric pre-registered by a human is left alone', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'firmographic_profiles_total',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'legacy_firmographic_export', timeColumn: 'reported_on', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const result = await ensureFirmographicPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['firmographic_profiles_total']);
    expect(result.registered).toEqual(['firmographic_mrr_total']);
  });

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureFirmographicPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureFirmographicPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toEqual(['firmographic_profiles_total', 'firmographic_mrr_total']);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(2);
    expect(defs.every((def) => def.version === 1)).toBe(true);
  });

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureFirmographicPackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'firmographic_profiles_total');
    expect(metricInOtherProject).toBeNull();
    const schemaInOtherProject = await getActiveSchemaDefinition(organization.id, otherProject.id, 'event', 'company_firmographic');
    expect(schemaInOtherProject).toBeNull();
  });
});
