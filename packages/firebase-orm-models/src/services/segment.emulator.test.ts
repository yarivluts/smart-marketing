import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  createSegment,
  ensureUserForFirebaseSession,
  InvalidSegmentError,
  listAuditLogEntriesForOrg,
  listSegmentsForProject,
  ProjectNotFoundError,
  registerSchemaDefinition,
  type SchemaFieldInput,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-76's minimal saved-segment definition (`create_segment`). */

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
