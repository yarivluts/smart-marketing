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
import { ensureFeedbackPackRegistered } from './index';

/** Emulator-backed tests for KAN-82's Feedback & NPS pack — mirrors `saas-metric-pack.emulator.test.ts`'s own shape (one shared registration per describe block, idempotency, project isolation). */

beforeAll(async () => {
  await connectToFirestoreEmulator('feedback-pack-tests');
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

describe('ensureFeedbackPackRegistered — schema + metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Feedback Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureFeedbackPackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers the survey_response event schema', async () => {
    const schemaDef = await getActiveSchemaDefinition(organizationId, projectId, 'event', 'survey_response');
    expect(schemaDef).not.toBeNull();
    expect(schemaDef?.field_defs.map((field) => field.name)).toEqual(['survey_type', 'score', 'comment']);
  });

  it('registers all four metrics as active v1', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(4);
    expect(defs.every((def) => def.version === 1 && def.status === 'active')).toBe(true);
  });

  it('registers nps_respondents: count(fact_survey_response where survey_type=nps and score>=0)', async () => {
    const metric = await activeMetric('nps_respondents');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'count',
      table: 'fact_survey_response',
      timeColumn: 'ts',
      filters: [
        { field: 'survey_type', operator: '=', value: 'nps' },
        { field: 'score', operator: '>=', value: '0' },
      ],
    });
    expect(metric?.dimensions).toEqual(['plan_interval', 'channel_id', 'cohort_month']);
  });

  it('registers nps_promoters: count(fact_survey_response where survey_type=nps and score>=9)', async () => {
    const metric = await activeMetric('nps_promoters');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'count',
      table: 'fact_survey_response',
      timeColumn: 'ts',
      filters: [
        { field: 'survey_type', operator: '=', value: 'nps' },
        { field: 'score', operator: '>=', value: '9' },
      ],
    });
    expect(metric?.dimensions).toEqual(['plan_interval', 'channel_id', 'cohort_month']);
  });

  it('registers nps_detractors: count(fact_survey_response where survey_type=nps and score<=6)', async () => {
    const metric = await activeMetric('nps_detractors');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'count',
      table: 'fact_survey_response',
      timeColumn: 'ts',
      filters: [
        { field: 'survey_type', operator: '=', value: 'nps' },
        { field: 'score', operator: '<=', value: '6' },
      ],
    });
    expect(metric?.dimensions).toEqual(['plan_interval', 'channel_id', 'cohort_month']);
  });

  it('registers nps_score: (nps_promoters - nps_detractors) / nps_respondents * 100', async () => {
    const metric = await activeMetric('nps_score');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('(nps_promoters - nps_detractors) / nps_respondents * 100');
    expect(metric?.dimensions).toEqual([]);
  });
});

describe('ensureFeedbackPackRegistered — idempotency and isolation', () => {
  it('partially idempotent: a metric pre-registered by a human is left alone, the other three still register', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'nps_respondents',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'legacy_nps_export', timeColumn: 'reported_on', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const result = await ensureFeedbackPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['nps_respondents']);
    expect(result.registered).toHaveLength(3);
    expect(result.registered).not.toContain('nps_respondents');
  });

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureFeedbackPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureFeedbackPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toHaveLength(4);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(4);
    expect(defs.every((def) => def.version === 1)).toBe(true);
  });

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureFeedbackPackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'nps_respondents');
    expect(metricInOtherProject).toBeNull();
    const schemaInOtherProject = await getActiveSchemaDefinition(organization.id, otherProject.id, 'event', 'survey_response');
    expect(schemaInOtherProject).toBeNull();
  });
});
