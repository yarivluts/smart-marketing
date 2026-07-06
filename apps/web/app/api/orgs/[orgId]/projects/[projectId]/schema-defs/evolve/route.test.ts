import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST as register } from '../route';
import { POST as evolve } from './route';

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
  return { ownerSession, organization, project };
}

function request(orgId: string, projectId: string, path: 'schema-defs' | 'schema-defs/evolve', body: unknown) {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

const v1Fields = [
  { name: 'order_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'user_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
];

describe('POST /api/orgs/[orgId]/projects/[projectId]/schema-defs/evolve', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request: req, params } = request('org-1', 'project-1', 'schema-defs/evolve', {
      kind: 'event',
      name: 'order_completed',
      fields: v1Fields,
    });
    const response = await evolve(req, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 evolving a schema that was never registered', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Evolve Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request: req, params } = request(organization.id, project.id, 'schema-defs/evolve', {
      kind: 'event',
      name: 'never_registered',
      fields: v1Fields,
    });
    const response = await evolve(req, { params });
    expect(response.status).toBe(404);
  });

  it('evolves v1 to v2 with an additive optional field', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Evolve Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const registerReq = request(organization.id, project.id, 'schema-defs', {
      kind: 'event',
      name: 'order_completed',
      fields: v1Fields,
    });
    expect((await register(registerReq.request, { params: registerReq.params })).status).toBe(201);

    const evolveReq = request(organization.id, project.id, 'schema-defs/evolve', {
      kind: 'event',
      name: 'order_completed',
      fields: [...v1Fields, { name: 'currency', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
    });
    const response = await evolve(evolveReq.request, { params: evolveReq.params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { schemaDef: { version: number; status: string } };
    expect(body.schemaDef.version).toBe(2);
    expect(body.schemaDef.status).toBe('active');
  });

  it('rejects a breaking change (removing a required field)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Evolve Breaking Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const registerReq = request(organization.id, project.id, 'schema-defs', {
      kind: 'event',
      name: 'order_completed',
      fields: v1Fields,
    });
    expect((await register(registerReq.request, { params: registerReq.params })).status).toBe(201);

    const evolveReq = request(organization.id, project.id, 'schema-defs/evolve', {
      kind: 'event',
      name: 'order_completed',
      fields: [v1Fields[0]],
    });
    const response = await evolve(evolveReq.request, { params: evolveReq.params });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; violations: string[] };
    expect(body.error).toBe('breaking_change');
    expect(body.violations.length).toBeGreaterThan(0);
  });
});
