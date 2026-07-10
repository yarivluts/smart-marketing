import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  createFieldMapping,
  createHookEndpoint,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  receiveHookPayload,
  registerSchemaDefinition,
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

function testRunRequest(orgId: string, projectId: string, body: unknown): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/field-mappings/test-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/field-mappings/test-run', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = testRunRequest('org-1', 'project-1', { samplePayload: SAMPLE_PAYLOAD, kind: 'event', schemaName: 'x', rules: VALID_EVENT_RULES });
    expect((await POST(request, { params })).status).toBe(401);
  });

  it('rejects a body with neither samplePayload nor hookDeliveryId', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Test Run Missing Sample Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = testRunRequest(organization.id, project.id, { kind: 'event', schemaName: 'order_completed', rules: VALID_EVENT_RULES });
    expect((await POST(request, { params })).status).toBe(400);
  });

  it('test-runs a draft mapping (kind + rules given directly) against pasted JSON', async () => {
    const { owner, ownerSession, organization, project } = await setupOrgProject('Test Run Draft Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = testRunRequest(organization.id, project.id, {
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      samplePayload: SAMPLE_PAYLOAD,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.errors).toEqual([]);
    expect(body.schemaValidationErrors).toEqual([]);
    expect(body.record).toEqual({ event_id: 'ord_1', event: 'order_completed', ts: '2024-01-01T00:00:00Z', properties: { order_id: 'ord_1' } });
  });

  it('test-runs a saved mapping by id, prefilling the sample from a queued hook delivery', async () => {
    const { owner, ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Test Run Saved Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);
    const mapping = await createFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'x',
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      createdByUserId: owner.id,
    });
    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'x',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });
    const received = await receiveHookPayload({ hookId: endpoint.hook_id, rawBody: SAMPLE_PAYLOAD, headers: {} });
    if (!received.ok) throw new Error('expected the delivery to be accepted');

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = testRunRequest(organization.id, project.id, {
      fieldMappingId: mapping.id,
      hookDeliveryId: received.value.delivery.id,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.errors).toEqual([]);
    expect(body.record.event_id).toBe('ord_1');
  });

  it('returns invalid_sample_payload for malformed JSON', async () => {
    const { owner, ownerSession, organization, project } = await setupOrgProject('Test Run Bad JSON Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = testRunRequest(organization.id, project.id, {
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      samplePayload: '{not json',
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_sample_payload');
  });

  it('returns 404 for an unknown fieldMappingId', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Test Run Unknown Mapping Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = testRunRequest(organization.id, project.id, {
      fieldMappingId: 'does-not-exist',
      samplePayload: SAMPLE_PAYLOAD,
    });
    expect((await POST(request, { params })).status).toBe(404);
  });
});
