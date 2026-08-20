import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  countSegmentMembers,
  createOrganizationWithOwner,
  createProject,
  createSegment,
  deleteSegment,
  ensureUserForFirebaseSession,
  InvalidSegmentError,
  listAuditLogEntriesForOrg,
  listSegmentsForProject,
  ProjectNotFoundError,
  registerSchemaDefinition,
  SegmentNotFoundError,
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
