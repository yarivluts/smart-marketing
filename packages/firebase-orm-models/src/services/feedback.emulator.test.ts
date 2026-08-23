import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureSurveyResponseSchemaRegistered,
  ensureUserForFirebaseSession,
  getFeedbackThemeDigestForProject,
  getNpsOverviewForProject,
  ProjectNotFoundError,
  RawRecordModel,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-82's `ensureSurveyResponseSchemaRegistered`/
 * `getNpsOverviewForProject`/`getFeedbackThemeDigestForProject`. Raw records
 * are landed directly via `RawRecordModel` — the same "bypass the full
 * ingest pipeline, control `landed_at` precisely" posture
 * `tracking-alert.emulator.test.ts` already established for its own reads.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('feedback-service-tests');
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

async function landNpsResponse(params: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  score?: number;
  comment?: string;
  landedAt: string;
}): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = 'survey_response';
  record.client_id = unique('client');
  const properties: Record<string, unknown> = { survey_type: 'nps' };
  if (params.score !== undefined) properties.score = params.score;
  if (params.comment !== undefined) properties.comment = params.comment;
  record.payload = { event: 'survey_response', event_id: unique('event'), ts: params.landedAt, properties };
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

describe('ensureSurveyResponseSchemaRegistered', () => {
  it('registers the survey_response event schema with the right fields', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Survey Schema Org');
    const result = await ensureSurveyResponseSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    expect(result.registered).toBe(true);
    expect(result.schemaDef.field_defs.map((field) => field.name)).toEqual(['survey_type', 'score', 'comment']);
    // Not flagged PII (see SURVEY_RESPONSE_SCHEMA_FIELDS's own doc comment): the theme digest's whole
    // point is surfacing this free text, matching billing-ops-view.ts's own free-text fields.
    expect(result.schemaDef.field_defs.find((field) => field.name === 'comment')?.is_pii).toBe(false);
  });

  it('is idempotent: a second call is a no-op and reports registered: false', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Survey Schema Idempotent Org');
    await ensureSurveyResponseSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    const second = await ensureSurveyResponseSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    expect(second.registered).toBe(false);
  });
});

describe('getNpsOverviewForProject', () => {
  it('computes the overall NPS breakdown from landed responses, ignoring malformed ones', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('NPS Overview Org');
    await ensureSurveyResponseSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    const now = Date.parse('2026-06-10T12:00:00.000Z');
    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 10, landedAt: '2026-06-01T09:00:00.000Z' });
    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 9, landedAt: '2026-06-02T09:00:00.000Z' });
    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 8, landedAt: '2026-06-03T09:00:00.000Z' });
    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 4, landedAt: '2026-06-04T09:00:00.000Z' });
    // Malformed: no score at all — must be ignored, not crash the read.
    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, landedAt: '2026-06-05T09:00:00.000Z' });

    const overview = await getNpsOverviewForProject(organization.id, project.id, { now });

    expect(overview.overall.totalResponses).toBe(4);
    expect(overview.overall.promoters).toBe(2);
    expect(overview.overall.passives).toBe(1);
    expect(overview.overall.detractors).toBe(1);
    expect(overview.overall.npsScore).toBe(25); // (2-1)/4*100
  });

  it('uses precomputedRecords instead of fetching, when provided', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('NPS Overview Precomputed Org');
    await ensureSurveyResponseSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    const now = Date.parse('2026-06-10T12:00:00.000Z');
    // Landed for real, but deliberately NOT what precomputedRecords below carries — proves the
    // precomputed path is actually used instead of re-fetching from Firestore.
    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 2, landedAt: '2026-06-01T09:00:00.000Z' });

    const precomputed = new RawRecordModel();
    precomputed.organization_id = organization.id;
    precomputed.project_id = project.id;
    precomputed.environment_id = environmentId;
    precomputed.partition_date = '2026-06-05';
    precomputed.batch_id = unique('batch');
    precomputed.kind = 'event';
    precomputed.schema_name = 'survey_response';
    precomputed.client_id = unique('client');
    precomputed.payload = { event: 'survey_response', event_id: unique('event'), ts: '2026-06-05T09:00:00.000Z', properties: { survey_type: 'nps', score: 10 } };
    precomputed.landed_at = '2026-06-05T09:00:00.000Z';

    const overview = await getNpsOverviewForProject(organization.id, project.id, { now, precomputedRecords: [precomputed] });
    expect(overview.overall.totalResponses).toBe(1);
    expect(overview.overall.promoters).toBe(1);
  });

  it('ignores non-nps survey_type responses (a future CSAT survey landing under the same schema)', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('NPS Overview CSAT Org');
    await ensureSurveyResponseSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    const now = Date.parse('2026-06-10T12:00:00.000Z');

    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 9, landedAt: '2026-06-01T09:00:00.000Z' });
    const csatRecord = new RawRecordModel();
    csatRecord.organization_id = organization.id;
    csatRecord.project_id = project.id;
    csatRecord.environment_id = environmentId;
    csatRecord.partition_date = '2026-06-02';
    csatRecord.batch_id = unique('batch');
    csatRecord.kind = 'event';
    csatRecord.schema_name = 'survey_response';
    csatRecord.client_id = unique('client');
    csatRecord.payload = { event: 'survey_response', event_id: unique('event'), ts: '2026-06-02T09:00:00.000Z', properties: { survey_type: 'csat', score: 1 } };
    csatRecord.landed_at = '2026-06-02T09:00:00.000Z';
    csatRecord.setPathParams({ organization_id: organization.id, project_id: project.id });
    await csatRecord.save();

    const overview = await getNpsOverviewForProject(organization.id, project.id, { now });
    expect(overview.overall.totalResponses).toBe(1);
  });

  it('buckets a daily trend across the window, with empty days present as zero-count buckets', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('NPS Trend Org');
    await ensureSurveyResponseSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    const now = Date.parse('2026-06-05T12:00:00.000Z');

    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 10, landedAt: '2026-06-01T09:00:00.000Z' });
    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 3, landedAt: '2026-06-05T09:00:00.000Z' });

    const overview = await getNpsOverviewForProject(organization.id, project.id, { now, windowDays: 5 });

    expect(overview.dailyTrend.map((point) => point.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']);
    expect(overview.dailyTrend[0].breakdown.totalResponses).toBe(1);
    expect(overview.dailyTrend[0].breakdown.promoters).toBe(1);
    expect(overview.dailyTrend[1].breakdown.totalResponses).toBe(0);
    expect(overview.dailyTrend[4].breakdown.detractors).toBe(1);
  });

  it('throws ProjectNotFoundError for a project id that does not exist', async () => {
    const { organization } = await setupOrgWithProject('NPS Overview Wrong Org');
    await expect(getNpsOverviewForProject(organization.id, unique('nonexistent-project'))).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe('getFeedbackThemeDigestForProject', () => {
  it('clusters landed comments into themes within the window, most common first', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Feedback Digest Org');
    await ensureSurveyResponseSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    const now = Date.parse('2026-06-10T12:00:00.000Z');

    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 4, comment: 'Way too expensive for what we get', landedAt: '2026-06-01T09:00:00.000Z' });
    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 3, comment: 'Pricing is too high for our team size', landedAt: '2026-06-02T09:00:00.000Z' });
    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 6, comment: 'Support takes forever to respond', landedAt: '2026-06-03T09:00:00.000Z' });
    // No comment at all -- must not crash or appear in the digest.
    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 9, landedAt: '2026-06-04T09:00:00.000Z' });

    const digest = await getFeedbackThemeDigestForProject(organization.id, project.id, { now, windowDays: 30 });

    expect(digest[0]).toMatchObject({ theme: 'pricing', commentCount: 2 });
    expect(digest[1]).toMatchObject({ theme: 'support', commentCount: 1 });
  });

  it('excludes comments landed outside the window', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Feedback Digest Window Org');
    await ensureSurveyResponseSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    const now = Date.parse('2026-06-30T12:00:00.000Z');

    await landNpsResponse({ organizationId: organization.id, projectId: project.id, environmentId, score: 2, comment: 'The app crashes constantly, so many bugs', landedAt: '2026-01-01T09:00:00.000Z' });

    const digest = await getFeedbackThemeDigestForProject(organization.id, project.id, { now, windowDays: 30 });
    expect(digest).toEqual([]);
  });
});
