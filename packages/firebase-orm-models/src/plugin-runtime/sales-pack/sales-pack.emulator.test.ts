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
import { ensureSalesPackRegistered } from './index';

/** Emulator-backed tests for KAN-92's Sales Pipeline pack — mirrors `support-pack.emulator.test.ts`'s own shape (one shared registration per describe block, idempotency, phase ordering). */

beforeAll(async () => {
  await connectToFirestoreEmulator('sales-pack-tests');
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

describe('ensureSalesPackRegistered — schema + metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Sales Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureSalesPackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers the demo_event event schema', async () => {
    const schema = await getActiveSchemaDefinition(organizationId, projectId, 'event', 'demo_event');
    expect(schema).not.toBeNull();
    expect(schema?.field_defs.map((field) => field.name)).toEqual(['demo_id', 'stage', 'rep_org_person_id', 'account_name']);
  });

  it('registers all four metrics as active v1', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(4);
    expect(defs.every((def) => def.version === 1 && def.status === 'active')).toBe(true);
  });

  it('registers demos_scheduled/held/no_show broken down by rep_org_person_id, each filtered to its own stage', async () => {
    const scheduled = await activeMetric('demos_scheduled');
    expect(scheduled?.definition_kind).toBe('aggregation');
    expect(scheduled?.aggregation).toEqual({
      function: 'count_distinct',
      table: 'fact_demo_event',
      column: 'demo_id',
      timeColumn: 'ts',
      filters: [{ field: 'stage', operator: '=', value: 'scheduled' }],
    });
    expect(scheduled?.dimensions).toEqual(['rep_org_person_id']);

    const held = await activeMetric('demos_held');
    expect(held?.aggregation).toMatchObject({ filters: [{ field: 'stage', operator: '=', value: 'held' }] });
    expect(held?.dimensions).toEqual(['rep_org_person_id']);

    const noShow = await activeMetric('demos_no_show');
    expect(noShow?.aggregation).toMatchObject({ filters: [{ field: 'stage', operator: '=', value: 'no_show' }] });
    expect(noShow?.dimensions).toEqual(['rep_org_person_id']);
  });

  it('registers demo_show_rate as an undimensioned formula referencing the held/no-show aggregations', async () => {
    const showRate = await activeMetric('demo_show_rate');
    expect(showRate?.definition_kind).toBe('formula');
    expect(showRate?.formula).toBe('demos_held / (demos_held + demos_no_show)');
    expect(showRate?.dimensions).toEqual([]);
  });
});

describe('ensureSalesPackRegistered — idempotency and isolation', () => {
  it('partially idempotent: a metric pre-registered by a human is left alone', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Sales Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'demos_scheduled',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'legacy_calendar_export', timeColumn: 'booked_on', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const result = await ensureSalesPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['demos_scheduled']);
    expect(result.registered).toEqual(['demos_held', 'demos_no_show', 'demo_show_rate']);
  });

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Sales Org');
    await ensureSalesPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureSalesPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toEqual(['demos_scheduled', 'demos_held', 'demos_no_show', 'demo_show_rate']);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(4);
  });
});
