import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  createFieldMapping,
  createHookEndpoint,
  disableFieldMapping,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  receiveHookPayload,
  registerSchemaDefinition,
  setHookDeliveryStatus,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST } from './route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function sessionFor(firebaseUid: string, email: string): Promise<DecodedIdToken> {
  await ensureUserForFirebaseSession({ firebaseUid, email });
  return { uid: firebaseUid, email } as DecodedIdToken;
}

async function setupOrgProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  return { owner, ownerSession, organization, project, prodEnvironment };
}

async function registerOrderCompletedSchema(organizationId: string, projectId: string, createdByUserId: string) {
  return registerSchemaDefinition({
    organizationId,
    projectId,
    kind: 'event',
    name: 'order_completed',
    fields: [{ name: 'order_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true }],
    createdByUserId,
  });
}

const VALID_EVENT_RULES = [
  { targetField: 'event_id', transform: 'rename', sourcePath: 'id' },
  { targetField: 'event', transform: 'static', staticValue: 'order_completed' },
  { targetField: 'ts', transform: 'rename', sourcePath: 'created_at' },
  { targetField: 'properties.order_id', transform: 'cast', sourcePath: 'id', castType: 'string' },
];

const SAMPLE_PAYLOAD = JSON.stringify({ id: 'ord_1', created_at: '2024-01-01T00:00:00Z' });

async function setupMappingAndDelivery(orgName: string, payload: string = SAMPLE_PAYLOAD) {
  const setup = await setupOrgProject(orgName);
  await registerOrderCompletedSchema(setup.organization.id, setup.project.id, setup.owner.id);
  const mapping = await createFieldMapping({
    organizationId: setup.organization.id,
    projectId: setup.project.id,
    environmentId: setup.prodEnvironment.id,
    name: 'x',
    kind: 'event',
    schemaName: 'order_completed',
    rules: VALID_EVENT_RULES,
    createdByUserId: setup.owner.id,
  });
  const endpoint = await createHookEndpoint({
    organizationId: setup.organization.id,
    projectId: setup.project.id,
    environmentId: setup.prodEnvironment.id,
    name: 'x',
    signatureMode: 'none',
    createdByUserId: setup.owner.id,
  });
  const received = await receiveHookPayload({ hookId: endpoint.hook_id, rawBody: payload, headers: {} });
  if (!received.ok) throw new Error('expected the delivery to be accepted');
  return { ...setup, mapping, delivery: received.value.delivery };
}

function applyRequest(
  orgId: string,
  projectId: string,
  fieldMappingId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; fieldMappingId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/field-mappings/${fieldMappingId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId, fieldMappingId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/field-mappings/[fieldMappingId]/apply', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = applyRequest('org-1', 'project-1', 'mapping-1', { hookDeliveryId: 'delivery-1' });
    expect((await POST(request, { params })).status).toBe(401);
  });

  it('rejects a body with no hookDeliveryId', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Apply Missing Delivery Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = applyRequest(organization.id, project.id, 'mapping-1', {});
    expect((await POST(request, { params })).status).toBe(400);
  });

  it('maps and ingests a clean delivery, returning the ingest summary', async () => {
    const { ownerSession, organization, project, mapping, delivery } = await setupMappingAndDelivery('Apply Clean Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = applyRequest(organization.id, project.id, mapping.id, { hookDeliveryId: delivery.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applied).toBe(true);
    expect(body.ingestSummary).toMatchObject({ accepted: 1, quarantined: 0, duplicates: 0 });
  });

  it('returns applied:false without an ingest summary when the mapped record fails validation', async () => {
    const { ownerSession, organization, project, mapping, delivery } = await setupMappingAndDelivery(
      'Apply Invalid Org',
      JSON.stringify({ not_the_expected_shape: true }),
    );
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = applyRequest(organization.id, project.id, mapping.id, { hookDeliveryId: delivery.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applied).toBe(false);
    expect(body.ingestSummary).toBeUndefined();
  });

  it('returns 404 for an unknown fieldMappingId', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Apply Unknown Mapping Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = applyRequest(organization.id, project.id, 'does-not-exist', { hookDeliveryId: 'does-not-exist' });
    expect((await POST(request, { params })).status).toBe(404);
  });

  it('returns mapping_disabled for a disabled mapping', async () => {
    const { ownerSession, owner, organization, project, mapping, delivery } = await setupMappingAndDelivery('Apply Disabled Org');
    await disableFieldMapping({ organizationId: organization.id, projectId: project.id, fieldMappingId: mapping.id, disabledByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = applyRequest(organization.id, project.id, mapping.id, { hookDeliveryId: delivery.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('mapping_disabled');
  });

  it('returns delivery_discarded for a discarded delivery', async () => {
    const { ownerSession, owner, organization, project, mapping, delivery } = await setupMappingAndDelivery('Apply Discarded Org');
    await setHookDeliveryStatus({ organizationId: organization.id, projectId: project.id, hookDeliveryId: delivery.id, status: 'discarded', actedByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = applyRequest(organization.id, project.id, mapping.id, { hookDeliveryId: delivery.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('delivery_discarded');
  });

  it('returns already_applied on a second apply attempt', async () => {
    const { ownerSession, organization, project, mapping, delivery } = await setupMappingAndDelivery('Apply Twice Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = applyRequest(organization.id, project.id, mapping.id, { hookDeliveryId: delivery.id });
    expect((await POST(first.request, { params: first.params })).status).toBe(200);

    const second = applyRequest(organization.id, project.id, mapping.id, { hookDeliveryId: delivery.id });
    const response = await POST(second.request, { params: second.params });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('already_applied');
  });
});
