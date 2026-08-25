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
import { ensureSupportPackRegistered } from './index';

/** Emulator-backed tests for KAN-90's Customer Support pack — mirrors `experiment-pack.emulator.test.ts`'s own shape (one shared registration per describe block, idempotency, phase ordering). */

beforeAll(async () => {
  await connectToFirestoreEmulator('support-pack-tests');
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

describe('ensureSupportPackRegistered — schema + metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Support Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureSupportPackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers the support_ticket_event event schema', async () => {
    const schema = await getActiveSchemaDefinition(organizationId, projectId, 'event', 'support_ticket_event');
    expect(schema).not.toBeNull();
    expect(schema?.field_defs.map((field) => field.name)).toEqual([
      'ticket_id',
      'stage',
      'agent_org_person_id',
      'first_response_seconds',
      'resolution_seconds',
      'csat_score',
    ]);
  });

  it('registers all six metrics as active v1', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(6);
    expect(defs.every((def) => def.version === 1 && def.status === 'active')).toBe(true);
  });

  it('registers support_tickets_opened with no dimensions, filtered to stage = opened', async () => {
    const opened = await activeMetric('support_tickets_opened');
    expect(opened?.definition_kind).toBe('aggregation');
    expect(opened?.aggregation).toEqual({
      function: 'count_distinct',
      table: 'fact_support_ticket_event',
      column: 'ticket_id',
      timeColumn: 'ts',
      filters: [{ field: 'stage', operator: '=', value: 'opened' }],
    });
    expect(opened?.dimensions).toEqual([]);
  });

  it('registers support_tickets_resolved/avg metrics broken down by agent_org_person_id, filtered to stage = resolved', async () => {
    const resolved = await activeMetric('support_tickets_resolved');
    expect(resolved?.aggregation).toEqual({
      function: 'count_distinct',
      table: 'fact_support_ticket_event',
      column: 'ticket_id',
      timeColumn: 'ts',
      filters: [{ field: 'stage', operator: '=', value: 'resolved' }],
    });
    expect(resolved?.dimensions).toEqual(['agent_org_person_id']);

    const avgFirstResponse = await activeMetric('support_avg_first_response_seconds');
    expect(avgFirstResponse?.aggregation).toMatchObject({ function: 'avg', column: 'first_response_seconds' });
    expect(avgFirstResponse?.dimensions).toEqual(['agent_org_person_id']);

    const avgResolution = await activeMetric('support_avg_resolution_seconds');
    expect(avgResolution?.aggregation).toMatchObject({ function: 'avg', column: 'resolution_seconds' });

    const avgCsat = await activeMetric('support_avg_csat_score');
    expect(avgCsat?.aggregation).toMatchObject({ function: 'avg', column: 'csat_score' });
  });

  it('registers support_open_backlog as an undimensioned formula referencing the two ticket-count aggregations, floored at zero', async () => {
    const backlog = await activeMetric('support_open_backlog');
    expect(backlog?.definition_kind).toBe('formula');
    expect(backlog?.formula).toBe('max(support_tickets_opened - support_tickets_resolved, 0)');
    expect(backlog?.dimensions).toEqual([]);
  });
});

describe('ensureSupportPackRegistered — idempotency and isolation', () => {
  it('partially idempotent: a metric pre-registered by a human is left alone', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'support_tickets_opened',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'legacy_ticket_export', timeColumn: 'reported_on', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const result = await ensureSupportPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['support_tickets_opened']);
    expect(result.registered).toEqual([
      'support_tickets_resolved',
      'support_avg_first_response_seconds',
      'support_avg_resolution_seconds',
      'support_avg_csat_score',
      'support_open_backlog',
    ]);
  });

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureSupportPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureSupportPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toEqual([
      'support_tickets_opened',
      'support_tickets_resolved',
      'support_avg_first_response_seconds',
      'support_avg_resolution_seconds',
      'support_avg_csat_score',
      'support_open_backlog',
    ]);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(6);
  });
});
