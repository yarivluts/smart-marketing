import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureSaasMetricPackRegistered,
  ensureUserForFirebaseSession,
  getActiveMetricDefinition,
  getActiveSchemaDefinition,
  listMetricDefinitionsForProject,
  registerMetricDefinition,
  type MetricDefModel,
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import { ensureQualityScorePackRegistered } from './index';

/** Emulator-backed tests for KAN-83's Intent & Quality Scoring pack — mirrors `churn-reason-pack.emulator.test.ts`'s own shape (one shared registration per describe block, idempotency, project isolation, and the extra cross-pack `ad_spend` reuse case). */

beforeAll(async () => {
  await connectToFirestoreEmulator('quality-score-pack-tests');
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

describe('ensureQualityScorePackRegistered — schema + metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Quality Score Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureQualityScorePackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers the onboarding_survey event schema', async () => {
    const schemaDef = await getActiveSchemaDefinition(organizationId, projectId, 'event', 'onboarding_survey');
    expect(schemaDef).not.toBeNull();
    expect(schemaDef?.field_defs.map((field) => field.name)).toEqual(['company_size', 'budget_range', 'urgency', 'use_case', 'quality_score']);
  });

  it('self-provisions the SaaS pack\'s ad_spend measure schema too, since two of its own metrics reference it', async () => {
    const schemaDef = await getActiveSchemaDefinition(organizationId, projectId, 'measure', 'ad_spend');
    expect(schemaDef).not.toBeNull();
  });

  it('registers every declared metric name across all three phases', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    const names = defs.map((def) => def.name).sort();
    expect(names).toEqual(
      [
        'ad_spend',
        'avg_signup_quality_score',
        'paying_signup_quality_score_sum',
        'paying_signups_scored',
        'quality_adjusted_cac',
        'quality_adjusted_cost_per_signup',
        'quality_weighted_new_paying',
        'quality_weighted_signups',
        'signup_quality_score_sum',
        'signups_scored',
      ].sort(),
    );
  });

  it('registers signup_quality_score_sum as a sum over fact_signup_quality_score, broken down by channel/cohort', async () => {
    const metric = await activeMetric('signup_quality_score_sum');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({ function: 'sum', table: 'fact_signup_quality_score', column: 'quality_score', timeColumn: 'ts', filters: [] });
    expect(metric?.dimensions).toEqual(['channel_id', 'cohort_month']);
  });

  it('registers paying_signup_quality_score_sum filtered to is_paying_customer = true', async () => {
    const metric = await activeMetric('paying_signup_quality_score_sum');
    expect(metric?.aggregation?.filters).toEqual([{ field: 'is_paying_customer', operator: '=', value: 'true' }]);
    expect(metric?.dimensions).toEqual(['channel_id']);
  });

  it('registers avg_signup_quality_score as a formula over the sum/count pair', async () => {
    const metric = await activeMetric('avg_signup_quality_score');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('signup_quality_score_sum / signups_scored');
    expect(metric?.dimensions).toEqual(['channel_id', 'cohort_month']);
  });

  it('registers quality_adjusted_cost_per_signup and quality_adjusted_cac as distinct formulas, both dividing by ad_spend', async () => {
    const cps = await activeMetric('quality_adjusted_cost_per_signup');
    const cac = await activeMetric('quality_adjusted_cac');
    expect(cps?.formula).toBe('ad_spend / quality_weighted_signups');
    expect(cac?.formula).toBe('ad_spend / quality_weighted_new_paying');
    expect(cps?.formula).not.toBe(cac?.formula);
  });
});

describe('ensureQualityScorePackRegistered — idempotency, isolation, and cross-pack ad_spend reuse', () => {
  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);

    const second = await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered.sort()).toEqual(
      ['signup_quality_score_sum', 'signups_scored', 'paying_signup_quality_score_sum', 'paying_signups_scored', 'ad_spend', 'avg_signup_quality_score', 'quality_weighted_signups', 'quality_weighted_new_paying', 'quality_adjusted_cost_per_signup', 'quality_adjusted_cac'].sort(),
    );

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs.every((def) => def.version === 1)).toBe(true);
  });

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'avg_signup_quality_score');
    expect(metricInOtherProject).toBeNull();
    const schemaInOtherProject = await getActiveSchemaDefinition(organization.id, otherProject.id, 'event', 'onboarding_survey');
    expect(schemaInOtherProject).toBeNull();
  });

  it('reuses the SaaS pack\'s own ad_spend metric when it is already installed, rather than conflicting with it', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Cross Pack Reuse Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const result = await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toContain('ad_spend');
    const adSpendDefs = (await listMetricDefinitionsForProject(organization.id, project.id)).filter((def) => def.name === 'ad_spend');
    expect(adSpendDefs).toHaveLength(1);
  });

  it('a metric pre-registered by a human under one of this pack\'s own names is left alone', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'avg_signup_quality_score',
      definition: { kind: 'aggregation', aggregation: { function: 'avg', table: 'legacy_intent_export', column: 'score', timeColumn: 'reported_on', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const result = await ensureQualityScorePackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toContain('avg_signup_quality_score');
    expect(result.registered).not.toContain('avg_signup_quality_score');
  });
});
