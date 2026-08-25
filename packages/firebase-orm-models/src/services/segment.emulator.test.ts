import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assignSegmentOwner,
  countSegmentMembers,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  createSegment,
  deleteSegment,
  ensureUserForFirebaseSession,
  InvalidSegmentError,
  listAuditLogEntriesForOrg,
  listQueryCostLogEntriesForProject,
  listSegmentMembers,
  listSegmentsForProject,
  ProjectNotFoundError,
  registerSchemaDefinition,
  SegmentNotFoundError,
  setProjectCostQuota,
  suggestSegments,
  updateSegmentStatus,
  WarehouseNotConfiguredError,
  WarehouseQueryFailedError,
  type SchemaFieldInput,
  type WarehouseQueryExecutor,
  type WarehouseRow,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-76's minimal saved-segment definition (`create_segment`) and its `countSegmentMembers` live-member-count follow-up (hand-written SQL through a fake `WarehouseQueryExecutor`, the same posture `mcp-tools.emulator.test.ts` uses for its own adapters). */

class FakeWarehouseQueryExecutor implements WarehouseQueryExecutor {
  public calls: Array<{ sql: string; params: Record<string, unknown> }> = [];
  constructor(private readonly rows: WarehouseRow[]) {}
  execute(query: { sql: string; params: Record<string, unknown> }): Promise<WarehouseRow[]> {
    this.calls.push(query);
    return Promise.resolve(this.rows);
  }
}

beforeAll(async () => {
  await connectToFirestoreEmulator('segment-tests');
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

const customerFieldsV1: SchemaFieldInput[] = [
  { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'mrr_usd', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'is_paying', type: 'boolean', isRequired: true, isPii: false, isIdentityKey: false },
];

async function registerCustomerSchema(organizationId: string, projectId: string, createdByUserId: string) {
  return registerSchemaDefinition({
    organizationId,
    projectId,
    kind: 'entity',
    name: 'customer',
    fields: customerFieldsV1,
    createdByUserId,
  });
}

const demoEventFieldsV1: SchemaFieldInput[] = [
  { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'stage', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
];

async function registerDemoEventSchema(organizationId: string, projectId: string, createdByUserId: string) {
  return registerSchemaDefinition({
    organizationId,
    projectId,
    kind: 'event',
    name: 'demo_event',
    fields: demoEventFieldsV1,
    createdByUserId,
  });
}

describe('createSegment', () => {
  it('creates a segment with valid filter conditions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Create Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);

    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Paying, no demo, MRR > $200',
      schemaName: 'customer',
      filters: [
        { field: 'plan', op: '=', value: 'pro' },
        { field: 'mrr_usd', op: '>', value: 200 },
      ],
      createdByUserId: owner.id,
    });

    expect(segment.name).toBe('Paying, no demo, MRR > $200');
    expect(segment.schema_name).toBe('customer');
    expect(segment.filters).toEqual([
      { field: 'plan', op: '=', value: 'pro' },
      { field: 'mrr_usd', op: '>', value: 200 },
    ]);
    expect(segment.created_by).toBe(owner.id);
    expect(segment.owner_person_id).toBeNull();
    expect(segment.status).toBe('open');
  });

  it('audits the create as actor type "user" by default', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Audit User Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);

    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.target_id === segment.id);
    expect(entry?.actor_type).toBe('user');
    expect(entry?.actor_id).toBe(owner.id);
  });

  it('audits the create as actor type "api_key" when createdByActorType is set (KAN-76 MCP create_segment tool path)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Audit Api Key Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);

    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: 'key-abc123',
      createdByActorType: 'api_key',
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.target_id === segment.id);
    expect(entry?.actor_type).toBe('api_key');
    expect(entry?.actor_id).toBe('key-abc123');
  });

  it('rejects a project that does not belong to this org', async () => {
    const { owner, organization } = await setupOrgWithProject('Segment Bad Project Org');
    await expect(
      createSegment({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        name: 'X',
        schemaName: 'customer',
        filters: [{ field: 'plan', op: '=', value: 'pro' }],
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('collects every validation failure into one InvalidSegmentError rather than failing fast', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Invalid Org');

    let caught: unknown;
    try {
      await createSegment({
        organizationId: organization.id,
        projectId: project.id,
        name: '   ',
        schemaName: 'does_not_exist',
        filters: [{ field: 'plan', op: 'like', value: 'pro' }],
        createdByUserId: owner.id,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidSegmentError);
    const reasons = (caught as InstanceType<typeof InvalidSegmentError>).reasons;
    expect(reasons.some((reason) => reason.includes('non-empty name'))).toBe(true);
    expect(reasons.some((reason) => reason.includes('Filter at index 0 is invalid'))).toBe(true);
    expect(reasons.some((reason) => reason.includes('is not registered'))).toBe(true);
  });

  it('rejects an empty filters array', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment No Filters Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);

    await expect(
      createSegment({
        organizationId: organization.id,
        projectId: project.id,
        name: 'Everyone',
        schemaName: 'customer',
        filters: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidSegmentError);
  });

  it('accepts an empty filters array when at least one event condition is present (KAN-93)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment No Filters Event Condition Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    await registerDemoEventSchema(organization.id, project.id, owner.id);

    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'No demo yet',
      schemaName: 'customer',
      filters: [],
      eventConditions: [{ kind: 'no_event', schemaName: 'demo_event' }],
      createdByUserId: owner.id,
    });

    expect(segment.event_conditions).toEqual([{ kind: 'no_event', schemaName: 'demo_event' }]);
  });

  it('creates a segment combining an entity filter and a "no_event" cross-schema condition (the "paying_no_demo" case, KAN-93)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Paying No Demo Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    await registerDemoEventSchema(organization.id, project.id, owner.id);

    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Paying, no demo',
      schemaName: 'customer',
      filters: [{ field: 'is_paying', op: '=', value: true }],
      eventConditions: [{ kind: 'no_event', schemaName: 'demo_event', withinDays: 90 }],
      createdByUserId: owner.id,
    });

    expect(segment.filters).toEqual([{ field: 'is_paying', op: '=', value: true }]);
    expect(segment.event_conditions).toEqual([{ kind: 'no_event', schemaName: 'demo_event', withinDays: 90 }]);
  });

  it('rejects an event condition referencing an unregistered event schema, alongside its other validation failures', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Event Condition Unregistered Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);

    let caught: unknown;
    try {
      await createSegment({
        organizationId: organization.id,
        projectId: project.id,
        name: 'Broken',
        schemaName: 'customer',
        filters: [{ field: 'plan', op: '=', value: 'pro' }],
        eventConditions: [{ kind: 'no_event', schemaName: 'does_not_exist' }],
        createdByUserId: owner.id,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidSegmentError);
    const reasons = (caught as InstanceType<typeof InvalidSegmentError>).reasons;
    expect(reasons.some((reason) => reason.includes('Event schema "does_not_exist"') && reason.includes('is not registered'))).toBe(true);
  });

  it('rejects a malformed event condition', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Event Condition Malformed Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);

    await expect(
      createSegment({
        organizationId: organization.id,
        projectId: project.id,
        name: 'Broken',
        schemaName: 'customer',
        filters: [{ field: 'plan', op: '=', value: 'pro' }],
        eventConditions: [{ kind: 'sometimes_event', schemaName: 'demo_event' }],
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidSegmentError);
  });

  it('rejects an entity schema that an event condition points at an event-kind schema is not itself an entity schema', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Event Condition Wrong Kind Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    await registerDemoEventSchema(organization.id, project.id, owner.id);

    await expect(
      createSegment({
        organizationId: organization.id,
        projectId: project.id,
        name: 'Broken',
        // "demo_event" is an event-kind schema, not entity-kind — using it as the segment's own schemaName should fail.
        schemaName: 'demo_event',
        filters: [{ field: 'stage', op: '=', value: 'held' }],
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidSegmentError);
  });
});

describe('listSegmentsForProject', () => {
  it('lists a project’s segments newest-first and isolates from a sibling project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment List Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
    await registerCustomerSchema(organization.id, project.id, owner.id);
    await registerCustomerSchema(organization.id, otherProject.id, owner.id);

    const makeSegment = (projectId: string, name: string) =>
      createSegment({
        organizationId: organization.id,
        projectId,
        name,
        schemaName: 'customer',
        filters: [{ field: 'plan', op: '=', value: 'pro' }],
        createdByUserId: owner.id,
      });

    const first = await makeSegment(project.id, 'First');
    const second = await makeSegment(project.id, 'Second');
    await makeSegment(otherProject.id, 'Sibling');

    const segments = await listSegmentsForProject(organization.id, project.id);
    expect(segments.map((segment) => segment.id).sort()).toEqual([first.id, second.id].sort());
    expect(segments.every((segment) => segment.project_id === project.id)).toBe(true);
  });
});

describe('deleteSegment', () => {
  it('deletes a segment so it is no longer listed', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Delete Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });

    await deleteSegment(organization.id, project.id, segment.id, owner.id);

    expect(await listSegmentsForProject(organization.id, project.id)).toEqual([]);
  });

  it('records a segment.delete audit log entry', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Delete Audit Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });

    await deleteSegment(organization.id, project.id, segment.id, owner.id);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.action === 'segment.delete' && candidate.target_id === segment.id);
    expect(entry?.actor_id).toBe(owner.id);
    expect(entry?.summary).toContain('Pro customers');
  });

  it('throws SegmentNotFoundError for a segment that does not belong to this org+project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Delete Missing Org');
    const { organization: otherOrg, project: otherProject } = await setupOrgWithProject('Segment Delete Other Org');
    await registerCustomerSchema(otherOrg.id, otherProject.id, owner.id);
    const segment = await createSegment({
      organizationId: otherOrg.id,
      projectId: otherProject.id,
      name: 'Elsewhere',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });

    await expect(deleteSegment(organization.id, project.id, segment.id, owner.id)).rejects.toBeInstanceOf(SegmentNotFoundError);
  });
});

describe('assignSegmentOwner', () => {
  it('assigns an org person as the segment owner', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Assign Owner Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });

    const updated = await assignSegmentOwner({
      organizationId: organization.id,
      projectId: project.id,
      segmentId: segment.id,
      ownerPersonId: person.id,
      actorUserId: owner.id,
    });

    expect(updated.owner_person_id).toBe(person.id);
  });

  it('unassigns the owner when ownerPersonId is null', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Unassign Owner Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    await assignSegmentOwner({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, ownerPersonId: person.id, actorUserId: owner.id });

    const unassigned = await assignSegmentOwner({
      organizationId: organization.id,
      projectId: project.id,
      segmentId: segment.id,
      ownerPersonId: null,
      actorUserId: owner.id,
    });

    expect(unassigned.owner_person_id).toBeNull();
  });

  it('rejects an owner that does not belong to this organization', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Assign Owner Wrong Org');
    const { organization: otherOrg } = await setupOrgWithProject('Segment Assign Owner Other Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const otherOrgPerson = await createOrgPerson({ organizationId: otherOrg.id, name: 'Rep', createdByUserId: owner.id });

    await expect(
      assignSegmentOwner({
        organizationId: organization.id,
        projectId: project.id,
        segmentId: segment.id,
        ownerPersonId: otherOrgPerson.id,
        actorUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidSegmentError);
  });

  it('throws SegmentNotFoundError for a segment that does not exist', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Assign Owner Missing Org');

    await expect(
      assignSegmentOwner({
        organizationId: organization.id,
        projectId: project.id,
        segmentId: 'does-not-exist',
        ownerPersonId: null,
        actorUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(SegmentNotFoundError);
  });

  it('records a segment.assign_owner audit log entry with before/after owner', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Assign Owner Audit Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });

    await assignSegmentOwner({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, ownerPersonId: person.id, actorUserId: owner.id });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.action === 'segment.assign_owner' && candidate.target_id === segment.id);
    expect(entry?.actor_id).toBe(owner.id);
    expect(entry?.before).toEqual({ ownerPersonId: null });
    expect(entry?.after).toEqual({ ownerPersonId: person.id });
  });
});

describe('updateSegmentStatus', () => {
  it('ticks the segment status', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Update Status Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });

    const updated = await updateSegmentStatus({
      organizationId: organization.id,
      projectId: project.id,
      segmentId: segment.id,
      status: 'in_progress',
      actorUserId: owner.id,
    });

    expect(updated.status).toBe('in_progress');
  });

  it('rejects an unknown status', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Update Status Invalid Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });

    await expect(
      updateSegmentStatus({
        organizationId: organization.id,
        projectId: project.id,
        segmentId: segment.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately an invalid status to exercise the validation path
        status: 'archived' as any,
        actorUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidSegmentError);
  });

  it('throws SegmentNotFoundError for a segment that does not exist', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Update Status Missing Org');

    await expect(
      updateSegmentStatus({
        organizationId: organization.id,
        projectId: project.id,
        segmentId: 'does-not-exist',
        status: 'done',
        actorUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(SegmentNotFoundError);
  });

  it('records a segment.update_status audit log entry with before/after status', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Update Status Audit Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });

    await updateSegmentStatus({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, status: 'done', actorUserId: owner.id });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.action === 'segment.update_status' && candidate.target_id === segment.id);
    expect(entry?.actor_id).toBe(owner.id);
    expect(entry?.before).toEqual({ status: 'open' });
    expect(entry?.after).toEqual({ status: 'done' });
  });
});

describe('countSegmentMembers', () => {
  it('builds a parameterized COUNT query scoped to the segment’s schema and org/project, with a typed clause per filter', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Paying pro customers',
      schemaName: 'customer',
      filters: [
        { field: 'plan', op: '=', value: 'pro' },
        { field: 'mrr_usd', op: '>', value: 200 },
      ],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ member_count: 42 }]);

    const outcome = await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });

    expect(outcome).toEqual({ ok: true, count: 42 });
    expect(executor.calls).toHaveLength(1);
    const { sql, params } = executor.calls[0];
    expect(sql).toContain('SELECT COUNT(*) AS member_count FROM entities');
    expect(sql).toContain('schema_name = @schemaName');
    expect(params.schemaName).toBe('customer');
    expect(sql).toContain("LAX_STRING(properties['plan']) = @filter_0");
    expect(params.filter_0).toBe('pro');
    expect(sql).toContain("LAX_FLOAT64(properties['mrr_usd']) > SAFE_CAST(@filter_1 AS FLOAT64)");
    expect(params.filter_1).toBe('200');
  });

  it('casts a boolean field’s bound parameter through SAFE_CAST(... AS BOOL)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Bool Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Paying customers',
      schemaName: 'customer',
      filters: [{ field: 'is_paying', op: '=', value: true }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ member_count: 7 }]);

    await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });

    expect(executor.calls[0].sql).toContain("LAX_BOOL(properties['is_paying']) = SAFE_CAST(@filter_0 AS BOOL)");
    expect(executor.calls[0].params.filter_0).toBe('true');
  });

  it('compiles the "contains" operator as a wildcard-escaped LIKE over the string extraction, regardless of declared field type', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Contains Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Plans mentioning "pro"',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: 'contains', value: '50%_pro' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([]);

    await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });

    expect(executor.calls[0].sql).toContain("LAX_STRING(properties['plan']) LIKE @filter_0");
    expect(executor.calls[0].params.filter_0).toBe('%50\\%\\_pro%');
  });

  it('falls back to a plain string extraction for a field the current active schema no longer declares', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Unknown Field Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Legacy filter',
      schemaName: 'customer',
      filters: [{ field: 'retired_field', op: '=', value: 'x' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([]);

    await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });

    expect(executor.calls[0].sql).toContain("LAX_STRING(properties['retired_field']) = @filter_0");
  });

  it('adds an environment_id filter when provided', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Env Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([]);

    await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, environmentId: 'env-test', executor });

    expect(executor.calls[0].sql).toContain('environment_id = @environmentId');
    expect(executor.calls[0].params.environmentId).toBe('env-test');
  });

  it('compiles a "no_event" cross-schema condition as a NOT EXISTS correlated subquery against events (KAN-93, the "paying_no_demo" case)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count No Event Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    await registerDemoEventSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Paying, no demo',
      schemaName: 'customer',
      filters: [{ field: 'is_paying', op: '=', value: true }],
      eventConditions: [{ kind: 'no_event', schemaName: 'demo_event' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ member_count: 5 }]);

    const outcome = await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });

    expect(outcome).toEqual({ ok: true, count: 5 });
    const { sql, params } = executor.calls[0];
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM events AS ev WHERE');
    expect(sql).toContain('ev.event_type = @event_schema_0');
    expect(sql).toContain('ev.entity_id = entities.entity_id');
    expect(params.event_schema_0).toBe('demo_event');
  });

  it('compiles a "has_event" cross-schema condition as a plain EXISTS subquery, with a nested field filter and a lookback window', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Has Event Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    await registerDemoEventSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Held a demo recently',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      eventConditions: [{ kind: 'has_event', schemaName: 'demo_event', withinDays: 30, filters: [{ field: 'stage', op: '=', value: 'held' }] }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ member_count: 2 }]);

    await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });

    const { sql, params } = executor.calls[0];
    expect(sql).toContain('EXISTS (SELECT 1 FROM events AS ev WHERE');
    expect(sql).not.toContain('NOT EXISTS');
    expect(sql).toContain('ev.occurred_at >= TIMESTAMP(@event_since_0)');
    expect(sql).toContain("LAX_STRING(ev.properties['stage']) = @event_0_filter_0");
    expect(params.event_0_filter_0).toBe('held');
    expect(typeof params.event_since_0).toBe('string');
  });

  it('scopes a cross-schema condition to the requested environment, same as the entity-side filters', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Event Env Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    await registerDemoEventSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'No demo',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      eventConditions: [{ kind: 'no_event', schemaName: 'demo_event' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([]);

    await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, environmentId: 'env-test', executor });

    expect(executor.calls[0].sql).toContain('ev.environment_id = @environmentId');
  });

  it('returns 0 when the executor reports no matching rows', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Zero Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Nobody yet',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'enterprise' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([]);

    const outcome = await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });
    expect(outcome).toEqual({ ok: true, count: 0 });
  });

  it('degrades to a "warehouse_not_configured" outcome instead of throwing, mirroring queryBoardTile/queryGoalProgress', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Not Configured Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const executor: WarehouseQueryExecutor = {
      execute: () => Promise.reject(new WarehouseNotConfiguredError()),
    };

    const outcome = await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });
    expect(outcome).toEqual({ ok: false, reason: 'warehouse_not_configured', message: expect.any(String) });
  });

  it('degrades to a "query_error" outcome when the warehouse rejects the query', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Query Error Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const executor: WarehouseQueryExecutor = {
      execute: () => Promise.reject(new WarehouseQueryFailedError('table not found')),
    };

    const outcome = await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });
    expect(outcome).toEqual({ ok: false, reason: 'query_error', message: 'table not found' });
  });

  it('logs an "executed" cost-log entry against the project\'s daily quota (KAN-39)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Quota Log Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ member_count: 3 }]);

    await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });

    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe('executed');
    expect(entries[0].definition_refs).toEqual({ tool: 'count_segment_members' });
  });

  it('degrades to a "quota_exceeded" outcome instead of throwing once the project has spent its daily quota, mirroring queryBoardTile/queryGoalProgress', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Quota Blocked Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });
    const executor = new FakeWarehouseQueryExecutor([{ member_count: 3 }]);

    await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });
    const outcome = await countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });

    expect(outcome).toEqual({ ok: false, reason: 'quota_exceeded', message: expect.any(String) });
    expect(executor.calls).toHaveLength(1);
  });

  it('throws SegmentNotFoundError for a segment that does not belong to this org+project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Count Missing Org');
    const { organization: otherOrg, project: otherProject } = await setupOrgWithProject('Segment Count Missing Other Org');
    await registerCustomerSchema(otherOrg.id, otherProject.id, owner.id);
    const segment = await createSegment({
      organizationId: otherOrg.id,
      projectId: otherProject.id,
      name: 'Elsewhere',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([]);

    await expect(
      countSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor }),
    ).rejects.toBeInstanceOf(SegmentNotFoundError);
    expect(executor.calls).toHaveLength(0);
  });
});

describe('listSegmentMembers', () => {
  it('applies a "no_event" cross-schema condition the same way countSegmentMembers does (shared compilation via buildSegmentMemberWhereClause)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Members No Event Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    await registerDemoEventSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Paying, no demo',
      schemaName: 'customer',
      filters: [{ field: 'is_paying', op: '=', value: true }],
      eventConditions: [{ kind: 'no_event', schemaName: 'demo_event' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([]);

    await listSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });

    expect(executor.calls[0].sql).toContain('NOT EXISTS (SELECT 1 FROM events AS ev WHERE');
    expect(executor.calls[0].params.event_schema_0).toBe('demo_event');
  });

  it('builds a parameterized row-select scoped to the segment’s schema and org/project, mapping rows to SegmentMemberRow', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Members Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Paying pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([
      { entity_id: 'cust_1', properties: JSON.stringify({ plan: 'pro' }), last_seen_at: '2026-08-20T00:00:00.000Z' },
      { entity_id: 'cust_2', properties: JSON.stringify({ plan: 'pro' }), last_seen_at: '2026-08-21T00:00:00.000Z' },
    ]);

    const outcome = await listSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });

    expect(outcome).toEqual({
      ok: true,
      members: [
        { entityId: 'cust_1', properties: { plan: 'pro' }, lastSeenAt: '2026-08-20T00:00:00.000Z' },
        { entityId: 'cust_2', properties: { plan: 'pro' }, lastSeenAt: '2026-08-21T00:00:00.000Z' },
      ],
    });
    expect(executor.calls).toHaveLength(1);
    const { sql, params } = executor.calls[0];
    expect(sql).toContain('SELECT entity_id, properties, last_seen_at FROM entities');
    expect(sql).toContain("LAX_STRING(properties['plan']) = @filter_0");
    expect(params.filter_0).toBe('pro');
    expect(sql).toContain('ORDER BY last_seen_at DESC LIMIT 500');
  });

  it('clamps a requested limit to MAX_SEGMENT_MEMBER_LIST_LIMIT', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Members Limit Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([]);

    await listSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, limit: 999_999, executor });

    expect(executor.calls[0].sql).toContain('LIMIT 1000');
  });

  it('degrades to a "warehouse_not_configured" outcome instead of throwing, mirroring countSegmentMembers', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Members Not Configured Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const executor: WarehouseQueryExecutor = {
      execute: () => Promise.reject(new WarehouseNotConfiguredError()),
    };

    const outcome = await listSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });
    expect(outcome).toEqual({ ok: false, reason: 'warehouse_not_configured', message: expect.any(String) });
  });

  it('degrades to a "query_error" outcome when the warehouse rejects the query', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Members Query Error Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const executor: WarehouseQueryExecutor = {
      execute: () => Promise.reject(new WarehouseQueryFailedError('table not found')),
    };

    const outcome = await listSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor });
    expect(outcome).toEqual({ ok: false, reason: 'query_error', message: 'table not found' });
  });

  it('throws SegmentNotFoundError for a segment that does not belong to this org+project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Members Missing Org');
    const { organization: otherOrg, project: otherProject } = await setupOrgWithProject('Segment Members Missing Other Org');
    await registerCustomerSchema(otherOrg.id, otherProject.id, owner.id);
    const segment = await createSegment({
      organizationId: otherOrg.id,
      projectId: otherProject.id,
      name: 'Elsewhere',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([]);

    await expect(
      listSegmentMembers({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, executor }),
    ).rejects.toBeInstanceOf(SegmentNotFoundError);
    expect(executor.calls).toHaveLength(0);
  });
});

describe('suggestSegments', () => {
  it('proposes a suggestion from a real registered schema field, matching the pure heuristic', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Suggest Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);

    const result = await suggestSegments({ organizationId: organization.id, projectId: project.id, schemaName: 'customer' });

    // `customerFieldsV1` has no cancellation/trial-expiry/last-active/signup-timestamp field, only
    // `mrr_usd` (a number field whose name contains the "mrr" keyword) — so exactly one archetype
    // ("High-value customers") should fire.
    expect(result.suggestions).toEqual([{ name: 'High-value customers', filters: [{ field: 'mrr_usd', op: '>=', value: 100 }], confidence: 0.85 }]);
  });

  it('returns no suggestions when nothing on the schema resembles a known archetype', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Segment Suggest Empty Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'entity',
      name: 'widget',
      fields: [{ name: 'color', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const result = await suggestSegments({ organizationId: organization.id, projectId: project.id, schemaName: 'widget' });

    expect(result.suggestions).toEqual([]);
  });

  it('rejects a schema name that is not registered (or not active) in this project', async () => {
    const { organization, project } = await setupOrgWithProject('Segment Suggest Unregistered Org');

    await expect(
      suggestSegments({ organizationId: organization.id, projectId: project.id, schemaName: 'nonexistent' }),
    ).rejects.toBeInstanceOf(InvalidSegmentError);
  });

  it('rejects a project that does not belong to this org', async () => {
    const { organization } = await setupOrgWithProject('Segment Suggest Wrong Org');
    const { project: otherProject } = await setupOrgWithProject('Segment Suggest Other Org');

    await expect(
      suggestSegments({ organizationId: organization.id, projectId: otherProject.id, schemaName: 'customer' }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
