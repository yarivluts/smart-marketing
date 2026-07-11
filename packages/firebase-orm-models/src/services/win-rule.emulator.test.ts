import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  createWinRule,
  deleteWinRule,
  ensureUserForFirebaseSession,
  evaluateRecordAgainstWinRules,
  ingestBatch,
  InvalidWinRuleError,
  listAuditLogEntriesForOrg,
  listRecentWinEventsForProject,
  listWinEventsSince,
  listWinRulesForProject,
  ProjectNotFoundError,
  registerSchemaDefinition,
  updateWinRule,
  WinRuleNotFoundError,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-65's win-rules engine: CRUD on `WinRuleModel`
 * plus `evaluateRecordAgainstWinRules`, the realtime "ingest -> win" detection
 * hop `ingest.service.ts` calls synchronously right after a record lands.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('win-rule-service-tests');
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
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  return { owner, organization, project, environmentId: prodEnvironment.id };
}

async function registerEventSchema(organizationId: string, projectId: string, name: string, createdByUserId: string) {
  return registerSchemaDefinition({
    organizationId,
    projectId,
    kind: 'event',
    name,
    fields: [{ name: 'amount', type: 'number', isRequired: false, isPii: false, isIdentityKey: false }],
    createdByUserId,
  });
}

describe('createWinRule', () => {
  it('creates a rule referencing an active event schema', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Win Rule Create Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);

    const rule = await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Big order',
      schemaName: 'order_completed',
      filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
      createdByUserId: owner.id,
    });

    expect(rule.name).toBe('Big order');
    expect(rule.schema_name).toBe('order_completed');
    expect(rule.active).toBe(true);
    expect(rule.filters).toEqual([{ field: 'properties.amount', operator: '>', value: '100' }]);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.some((entry) => entry.action === 'win_rule.create')).toBe(true);
  });

  it('rejects an empty name', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Win Rule Empty Name Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);

    await expect(
      createWinRule({
        organizationId: organization.id,
        projectId: project.id,
        name: '   ',
        schemaName: 'order_completed',
        filters: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidWinRuleError);
  });

  it('rejects a schema name that is not a registered active event schema', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Win Rule Unknown Schema Org');

    await expect(
      createWinRule({
        organizationId: organization.id,
        projectId: project.id,
        name: 'Ghost win',
        schemaName: 'does_not_exist',
        filters: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidWinRuleError);
  });

  it('rejects an unknown filter operator', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Win Rule Bad Operator Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);

    await expect(
      createWinRule({
        organizationId: organization.id,
        projectId: project.id,
        name: 'Bad filter',
        schemaName: 'order_completed',
        filters: [{ field: 'properties.amount', operator: 'in' as never, value: '100' }],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidWinRuleError);
  });

  it('rejects a filter with an empty field', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Win Rule Empty Field Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);

    await expect(
      createWinRule({
        organizationId: organization.id,
        projectId: project.id,
        name: 'Bad filter',
        schemaName: 'order_completed',
        filters: [{ field: '  ', operator: '>', value: '100' }],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidWinRuleError);
  });

  it('rejects a project that does not exist', async () => {
    const { organization } = await setupOrgWithProject('Win Rule Missing Project Org');
    await expect(
      createWinRule({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        name: 'Anything',
        schemaName: 'order_completed',
        filters: [],
        createdByUserId: 'someone',
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });
});

describe('listWinRulesForProject', () => {
  it('lists every rule in a project, newest-first', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Win Rule List Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    await registerEventSchema(organization.id, project.id, 'signup', owner.id);

    const first = await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'New signup',
      schemaName: 'signup',
      filters: [],
      createdByUserId: owner.id,
    });
    const second = await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Big order',
      schemaName: 'order_completed',
      filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
      createdByUserId: owner.id,
    });

    const rules = await listWinRulesForProject(organization.id, project.id);
    expect(rules.map((rule) => rule.id)).toEqual([second.id, first.id]);
  });

  it('rejects a project id that belongs to a different organization (KAN-26 non-enumeration)', async () => {
    const { organization: orgA } = await setupOrgWithProject('Win Rule Isolation Org A');
    const { project: projectB } = await setupOrgWithProject('Win Rule Isolation Org B');
    await expect(listWinRulesForProject(orgA.id, projectB.id)).rejects.toThrow(ProjectNotFoundError);
  });
});

describe('updateWinRule', () => {
  it('renames a rule and replaces its filters', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Win Rule Update Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    const rule = await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Big order',
      schemaName: 'order_completed',
      filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
      createdByUserId: owner.id,
    });

    const updated = await updateWinRule({
      organizationId: organization.id,
      projectId: project.id,
      winRuleId: rule.id,
      name: 'Huge order',
      filters: [{ field: 'properties.amount', operator: '>', value: '1000' }],
      updatedByUserId: owner.id,
    });

    expect(updated.name).toBe('Huge order');
    expect(updated.filters).toEqual([{ field: 'properties.amount', operator: '>', value: '1000' }]);
    expect(updated.active).toBe(true);
  });

  it('toggles active without touching name/filters when omitted', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Win Rule Toggle Org');
    await registerEventSchema(organization.id, project.id, 'signup', owner.id);
    const rule = await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'New signup',
      schemaName: 'signup',
      filters: [],
      createdByUserId: owner.id,
    });

    const disabled = await updateWinRule({
      organizationId: organization.id,
      projectId: project.id,
      winRuleId: rule.id,
      active: false,
      updatedByUserId: owner.id,
    });

    expect(disabled.active).toBe(false);
    expect(disabled.name).toBe('New signup');
  });

  it('rejects an unknown win rule id', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Win Rule Missing Rule Org');
    await expect(
      updateWinRule({
        organizationId: organization.id,
        projectId: project.id,
        winRuleId: 'does-not-exist',
        active: false,
        updatedByUserId: owner.id,
      }),
    ).rejects.toThrow(WinRuleNotFoundError);
  });
});

describe('deleteWinRule', () => {
  it('deletes a rule outright', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Win Rule Delete Org');
    await registerEventSchema(organization.id, project.id, 'signup', owner.id);
    const rule = await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'New signup',
      schemaName: 'signup',
      filters: [],
      createdByUserId: owner.id,
    });

    await deleteWinRule(organization.id, project.id, rule.id, owner.id);

    const rules = await listWinRulesForProject(organization.id, project.id);
    expect(rules).toHaveLength(0);
  });
});

describe('evaluateRecordAgainstWinRules', () => {
  it('fires a win when a filterless rule sees any matching event', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Win Eval Filterless Org');
    await registerEventSchema(organization.id, project.id, 'first_charge', owner.id);
    const rule = await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'First charge',
      schemaName: 'first_charge',
      filters: [],
      createdByUserId: owner.id,
    });

    const wins = await evaluateRecordAgainstWinRules({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      kind: 'event',
      schemaName: 'first_charge',
      clientId: 'evt_1',
      payload: { properties: { amount: 1 } },
      rawRecordId: 'raw_1',
      occurredAt: '2026-07-11T00:00:00.000Z',
    });

    expect(wins).toHaveLength(1);
    expect(wins[0].win_rule_id).toBe(rule.id);
    expect(wins[0].win_rule_name).toBe('First charge');

    const feed = await listRecentWinEventsForProject(organization.id, project.id);
    expect(feed).toHaveLength(1);
    expect(feed[0].raw_record_id).toBe('raw_1');
  });

  it('only fires when the numeric filter is satisfied', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Win Eval Filter Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Big order',
      schemaName: 'order_completed',
      filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
      createdByUserId: owner.id,
    });

    const small = await evaluateRecordAgainstWinRules({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      kind: 'event',
      schemaName: 'order_completed',
      clientId: 'evt_small',
      payload: { properties: { amount: 50 } },
      rawRecordId: 'raw_small',
      occurredAt: '2026-07-11T00:00:00.000Z',
    });
    expect(small).toHaveLength(0);

    const big = await evaluateRecordAgainstWinRules({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      kind: 'event',
      schemaName: 'order_completed',
      clientId: 'evt_big',
      payload: { properties: { amount: 150 } },
      rawRecordId: 'raw_big',
      occurredAt: '2026-07-11T00:00:00.000Z',
    });
    expect(big).toHaveLength(1);
  });

  it('never fires for a disabled rule', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Win Eval Disabled Org');
    await registerEventSchema(organization.id, project.id, 'signup', owner.id);
    const rule = await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'New signup',
      schemaName: 'signup',
      filters: [],
      createdByUserId: owner.id,
    });
    await updateWinRule({
      organizationId: organization.id,
      projectId: project.id,
      winRuleId: rule.id,
      active: false,
      updatedByUserId: owner.id,
    });

    const wins = await evaluateRecordAgainstWinRules({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      kind: 'event',
      schemaName: 'signup',
      clientId: 'evt_1',
      payload: {},
      rawRecordId: 'raw_1',
      occurredAt: '2026-07-11T00:00:00.000Z',
    });
    expect(wins).toHaveLength(0);
  });

  it('is a no-op for non-event kinds', async () => {
    const { organization, project, environmentId } = await setupOrgWithProject('Win Eval Non Event Org');

    const wins = await evaluateRecordAgainstWinRules({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      kind: 'entity',
      schemaName: 'customer',
      clientId: 'cust_1',
      payload: {},
      rawRecordId: 'raw_1',
      occurredAt: '2026-07-11T00:00:00.000Z',
    });
    expect(wins).toHaveLength(0);
  });

  it('re-evaluating the same (record, rule) pair is idempotent, not a duplicate feed entry', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Win Eval Idempotent Org');
    await registerEventSchema(organization.id, project.id, 'signup', owner.id);
    await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'New signup',
      schemaName: 'signup',
      filters: [],
      createdByUserId: owner.id,
    });

    const params = {
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      kind: 'event' as const,
      schemaName: 'signup',
      clientId: 'evt_1',
      payload: {},
      rawRecordId: 'raw_1',
      occurredAt: '2026-07-11T00:00:00.000Z',
    };
    await evaluateRecordAgainstWinRules(params);
    await evaluateRecordAgainstWinRules(params);

    const feed = await listRecentWinEventsForProject(organization.id, project.id);
    expect(feed).toHaveLength(1);
  });

  it('fires independently for multiple rules watching the same schema', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Win Eval Multi Rule Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Any order',
      schemaName: 'order_completed',
      filters: [],
      createdByUserId: owner.id,
    });
    await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Big order',
      schemaName: 'order_completed',
      filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
      createdByUserId: owner.id,
    });

    const wins = await evaluateRecordAgainstWinRules({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      kind: 'event',
      schemaName: 'order_completed',
      clientId: 'evt_1',
      payload: { properties: { amount: 500 } },
      rawRecordId: 'raw_1',
      occurredAt: '2026-07-11T00:00:00.000Z',
    });
    expect(wins).toHaveLength(2);
  });
});

describe('listWinEventsSince', () => {
  it('returns only wins created strictly after the given cursor, oldest-first', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Win Feed Poll Org');
    await registerEventSchema(organization.id, project.id, 'signup', owner.id);
    await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'New signup',
      schemaName: 'signup',
      filters: [],
      createdByUserId: owner.id,
    });

    await evaluateRecordAgainstWinRules({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      kind: 'event',
      schemaName: 'signup',
      clientId: 'evt_1',
      payload: {},
      rawRecordId: 'raw_1',
      occurredAt: '2026-07-11T00:00:00.000Z',
    });
    const [firstBatch] = await listRecentWinEventsForProject(organization.id, project.id);

    const none = await listWinEventsSince(organization.id, project.id, firstBatch.created_at);
    expect(none).toHaveLength(0);

    const beforeCursor = new Date(Date.parse(firstBatch.created_at) - 1).toISOString();
    const some = await listWinEventsSince(organization.id, project.id, beforeCursor);
    expect(some.map((event) => event.id)).toEqual([firstBatch.id]);
  });
});

describe('evaluateRecordAgainstWinRules — end to end via ingestBatch', () => {
  it('a matching event landed through the real ingest API fires a win within the same request', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Win Ingest E2E Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: [{ name: 'amount', type: 'number', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });
    await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Big order',
      schemaName: 'order_completed',
      filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
      createdByUserId: owner.id,
    });

    await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      input: {
        kind: 'event',
        records: [
          { event_id: 'ord_9001-evt', event: 'order_completed', ts: '2026-07-11T00:00:00Z', properties: { amount: 250 } },
        ],
      },
    });

    const feed = await listRecentWinEventsForProject(organization.id, project.id);
    expect(feed).toHaveLength(1);
    expect(feed[0].schema_name).toBe('order_completed');
    expect(feed[0].client_id).toBe('ord_9001-evt');
  });

  it('does not fire a win for an event that fails its filter', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Win Ingest E2E Miss Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: [{ name: 'amount', type: 'number', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });
    await createWinRule({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Big order',
      schemaName: 'order_completed',
      filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
      createdByUserId: owner.id,
    });

    await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      input: {
        kind: 'event',
        records: [
          { event_id: 'ord_9002-evt', event: 'order_completed', ts: '2026-07-11T00:00:00Z', properties: { amount: 10 } },
        ],
      },
    });

    const feed = await listRecentWinEventsForProject(organization.id, project.id);
    expect(feed).toHaveLength(0);
  });
});
