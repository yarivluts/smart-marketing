import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, registerSchemaDefinition } from '@growthos/firebase-orm-models';
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
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, ownerSession, organization, project };
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

const SAMPLE_PAYLOAD = JSON.stringify({ id: 'ord_1', order_id: 'ord_1' });

function suggestRequest(orgId: string, projectId: string, body: unknown): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/field-mappings/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/field-mappings/suggest', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = suggestRequest('org-1', 'project-1', { kind: 'event', schemaName: 'x', samplePayload: SAMPLE_PAYLOAD });
    expect((await POST(request, { params })).status).toBe(401);
  });

  it('rejects a body missing kind/schemaName/samplePayload', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Suggest Missing Fields Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missingKind = suggestRequest(organization.id, project.id, { schemaName: 'x', samplePayload: SAMPLE_PAYLOAD });
    expect((await POST(missingKind.request, { params: missingKind.params })).status).toBe(400);

    const missingSchemaName = suggestRequest(organization.id, project.id, { kind: 'event', samplePayload: SAMPLE_PAYLOAD });
    expect((await POST(missingSchemaName.request, { params: missingSchemaName.params })).status).toBe(400);

    const missingSample = suggestRequest(organization.id, project.id, { kind: 'event', schemaName: 'x' });
    expect((await POST(missingSample.request, { params: missingSample.params })).status).toBe(400);
  });

  it('proposes rules against a registered schema from a sample payload', async () => {
    const { owner, ownerSession, organization, project } = await setupOrgProject('Suggest Draft Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = suggestRequest(organization.id, project.id, { kind: 'event', schemaName: 'order_completed', samplePayload: SAMPLE_PAYLOAD });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions.some((s: { targetField: string }) => s.targetField === 'properties.order_id')).toBe(true);
  });

  it('returns target_schema_not_registered when the schema has no active version', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Suggest No Schema Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = suggestRequest(organization.id, project.id, { kind: 'event', schemaName: 'does_not_exist', samplePayload: SAMPLE_PAYLOAD });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('target_schema_not_registered');
  });

  it('returns invalid_sample_payload for malformed JSON', async () => {
    const { owner, ownerSession, organization, project } = await setupOrgProject('Suggest Bad JSON Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = suggestRequest(organization.id, project.id, { kind: 'event', schemaName: 'order_completed', samplePayload: '{not json' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_sample_payload');
  });
});
