import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureSupportTicketSchemaRegistered,
  ensureUserForFirebaseSession,
  getSupportLeaderboardForProject,
  ProjectNotFoundError,
  RawRecordModel,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-90's `ensureSupportTicketSchemaRegistered`/
 * `getSupportLeaderboardForProject`. Raw records are landed directly via
 * `RawRecordModel` — same "bypass the full ingest pipeline, control
 * `landed_at` precisely" posture `feedback.emulator.test.ts` (KAN-82)
 * establishes.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('support-service-tests');
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

async function landTicketEvent(params: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  ticketId: string;
  stage: 'opened' | 'resolved';
  agentOrgPersonId?: string;
  firstResponseSeconds?: number;
  resolutionSeconds?: number;
  csatScore?: number;
  landedAt: string;
}): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = 'support_ticket_event';
  record.client_id = unique('client');
  const properties: Record<string, unknown> = { ticket_id: params.ticketId, stage: params.stage };
  if (params.agentOrgPersonId !== undefined) properties.agent_org_person_id = params.agentOrgPersonId;
  if (params.firstResponseSeconds !== undefined) properties.first_response_seconds = params.firstResponseSeconds;
  if (params.resolutionSeconds !== undefined) properties.resolution_seconds = params.resolutionSeconds;
  if (params.csatScore !== undefined) properties.csat_score = params.csatScore;
  record.payload = { event: 'support_ticket_event', event_id: unique('event'), ts: params.landedAt, properties };
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

describe('ensureSupportTicketSchemaRegistered', () => {
  it('registers the support_ticket_event event schema with the right fields', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Support Schema Org');
    const result = await ensureSupportTicketSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    expect(result.registered).toBe(true);
    expect(result.schemaDef.field_defs.map((field) => field.name)).toEqual([
      'ticket_id',
      'stage',
      'agent_org_person_id',
      'first_response_seconds',
      'resolution_seconds',
      'csat_score',
    ]);
  });

  it('is idempotent: a second call is a no-op and reports registered: false', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Support Schema Idempotent Org');
    await ensureSupportTicketSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    const second = await ensureSupportTicketSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    expect(second.registered).toBe(false);
  });
});

describe('getSupportLeaderboardForProject', () => {
  it('computes the leaderboard and open backlog from landed ticket events', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Support Leaderboard Org');
    await ensureSupportTicketSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    await landTicketEvent({ organizationId: organization.id, projectId: project.id, environmentId, ticketId: 't1', stage: 'opened', landedAt: '2026-09-01T08:00:00.000Z' });
    await landTicketEvent({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      ticketId: 't1',
      stage: 'resolved',
      agentOrgPersonId: 'agent_1',
      firstResponseSeconds: 300,
      resolutionSeconds: 3600,
      csatScore: 5,
      landedAt: '2026-09-01T09:00:00.000Z',
    });
    await landTicketEvent({ organizationId: organization.id, projectId: project.id, environmentId, ticketId: 't2', stage: 'opened', landedAt: '2026-09-01T10:00:00.000Z' });

    const result = await getSupportLeaderboardForProject(organization.id, project.id);

    expect(result.ticketsOpened).toBe(2);
    expect(result.openBacklog).toBe(1);
    expect(result.rows).toEqual([{ agentOrgPersonId: 'agent_1', ticketsResolved: 1, avgFirstResponseSeconds: 300, avgResolutionSeconds: 3600, avgCsatScore: 5 }]);
  });

  it('uses precomputedRecords instead of fetching, when provided', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Support Leaderboard Precomputed Org');
    await ensureSupportTicketSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    // Landed for real, but deliberately NOT what precomputedRecords below carries — proves the
    // precomputed path is actually used instead of re-fetching from Firestore.
    await landTicketEvent({ organizationId: organization.id, projectId: project.id, environmentId, ticketId: 'real', stage: 'opened', landedAt: '2026-09-01T08:00:00.000Z' });

    const precomputed = new RawRecordModel();
    precomputed.organization_id = organization.id;
    precomputed.project_id = project.id;
    precomputed.environment_id = environmentId;
    precomputed.partition_date = '2026-09-02';
    precomputed.batch_id = unique('batch');
    precomputed.kind = 'event';
    precomputed.schema_name = 'support_ticket_event';
    precomputed.client_id = unique('client');
    precomputed.payload = { event: 'support_ticket_event', event_id: unique('event'), ts: '2026-09-02T08:00:00.000Z', properties: { ticket_id: 'precomputed', stage: 'opened' } };
    precomputed.landed_at = '2026-09-02T08:00:00.000Z';

    const result = await getSupportLeaderboardForProject(organization.id, project.id, { precomputedRecords: [precomputed] });
    expect(result.ticketsOpened).toBe(1);
  });

  it('throws ProjectNotFoundError for a project id that does not exist', async () => {
    const { organization } = await setupOrgWithProject('Support Leaderboard Wrong Org');
    await expect(getSupportLeaderboardForProject(organization.id, unique('nonexistent-project'))).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
