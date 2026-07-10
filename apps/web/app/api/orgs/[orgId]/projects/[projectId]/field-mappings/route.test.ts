import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  registerSchemaDefinition,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET, POST } from './route';

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

function fieldMappingsRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/field-mappings`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/field-mappings', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = fieldMappingsRequest('org-1', 'project-1');
    expect((await GET(request, { params })).status).toBe(401);
  });

  it("rejects a member whose role doesn't hold ingest.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Field Mapping List Org');
    const viewerEmail = uniqueEmail('field-mapping-list-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('field-mapping-list-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = fieldMappingsRequest(organization.id, project.id);
    expect((await GET(request, { params })).status).toBe(403);
  });

  it('lets an org_owner list field mappings for the project (empty when none created yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Field Mapping List Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = fieldMappingsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ fieldMappings: [] });
  });

  it("returns 404 for a project id that doesn't belong to this org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Field Mapping List Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = fieldMappingsRequest(organization.id, 'does-not-exist-project');
    expect((await GET(request, { params })).status).toBe(404);
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/field-mappings', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = fieldMappingsRequest('org-1', 'project-1', {
      name: 'X',
      environmentId: 'env-1',
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
    });
    expect((await POST(request, { params })).status).toBe(401);
  });

  it('rejects a missing name, missing environment, and missing rules', async () => {
    const { ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Field Mapping Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missingName = fieldMappingsRequest(organization.id, project.id, {
      name: '',
      environmentId: prodEnvironment.id,
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
    });
    expect((await POST(missingName.request, { params: missingName.params })).status).toBe(400);

    const missingEnv = fieldMappingsRequest(organization.id, project.id, {
      name: 'X',
      environmentId: '',
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
    });
    expect((await POST(missingEnv.request, { params: missingEnv.params })).status).toBe(400);

    const missingRules = fieldMappingsRequest(organization.id, project.id, {
      name: 'X',
      environmentId: prodEnvironment.id,
      kind: 'event',
      schemaName: 'order_completed',
      rules: [],
    });
    expect((await POST(missingRules.request, { params: missingRules.params })).status).toBe(400);
  });

  it('rejects a mapping whose target schema is not registered', async () => {
    const { ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Field Mapping No Schema Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = fieldMappingsRequest(organization.id, project.id, {
      name: 'X',
      environmentId: prodEnvironment.id,
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('target_schema_not_registered');
  });

  it('rejects an incomplete rule set with the validation reasons', async () => {
    const { owner, ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Field Mapping Invalid Rules Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = fieldMappingsRequest(organization.id, project.id, {
      name: 'X',
      environmentId: prodEnvironment.id,
      kind: 'event',
      schemaName: 'order_completed',
      rules: [{ targetField: 'event_id', transform: 'rename', sourcePath: 'id' }],
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_rules');
    expect(body.reasons.length).toBeGreaterThan(0);
  });

  it('creates a mapping and lists it', async () => {
    const { owner, ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Field Mapping Create Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = fieldMappingsRequest(organization.id, project.id, {
      name: 'Shopify orders -> order_completed',
      environmentId: prodEnvironment.id,
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { fieldMapping: { id: string } };
    expect(body.fieldMapping.id).toEqual(expect.any(String));

    const listResponse = await GET(fieldMappingsRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { fieldMappings: Array<Record<string, unknown>> };
    expect(listed.fieldMappings).toHaveLength(1);
    expect(listed.fieldMappings[0]).toMatchObject({ id: body.fieldMapping.id, name: 'Shopify orders -> order_completed', kind: 'event', schemaName: 'order_completed' });
  });
});
