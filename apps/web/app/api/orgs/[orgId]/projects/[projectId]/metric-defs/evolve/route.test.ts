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

function request(orgId: string, projectId: string, path: 'metric-defs' | 'metric-defs/evolve', body: unknown) {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

const adSpendV1 = {
  name: 'ad_spend',
  definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', filters: [] } },
  dimensions: ['channel'],
};

describe('POST /api/orgs/[orgId]/projects/[projectId]/metric-defs/evolve', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request: req, params } = request('org-1', 'project-1', 'metric-defs/evolve', adSpendV1);
    const response = await evolve(req, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 evolving a metric that was never registered', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Evolve Missing Metric Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request: req, params } = request(organization.id, project.id, 'metric-defs/evolve', {
      ...adSpendV1,
      name: 'never_registered',
    });
    const response = await evolve(req, { params });
    expect(response.status).toBe(404);
  });

  it('evolves v1 to v2 with an additional filter', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Evolve Metric Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const registerReq = request(organization.id, project.id, 'metric-defs', adSpendV1);
    expect((await register(registerReq.request, { params: registerReq.params })).status).toBe(201);

    const evolveReq = request(organization.id, project.id, 'metric-defs/evolve', {
      name: 'ad_spend',
      definition: {
        kind: 'aggregation',
        aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', filters: [{ field: 'platform', operator: '!=', value: 'test' }] },
      },
      dimensions: ['channel', 'campaign'],
    });
    const response = await evolve(evolveReq.request, { params: evolveReq.params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { metricDef: { version: number; status: string; dimensions: string[] } };
    expect(body.metricDef.version).toBe(2);
    expect(body.metricDef.status).toBe('active');
    expect(body.metricDef.dimensions).toEqual(['channel', 'campaign']);
  });

  it('rejects an invalid evolution (a formula referencing an unregistered metric)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Evolve Invalid Metric Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const registerAdSpend = request(organization.id, project.id, 'metric-defs', adSpendV1);
    expect((await register(registerAdSpend.request, { params: registerAdSpend.params })).status).toBe(201);
    const registerPlaceholder = request(organization.id, project.id, 'metric-defs', {
      name: 'placeholder',
      definition: { kind: 'formula', formula: 'ad_spend / 1' },
      dimensions: [],
    });
    expect((await register(registerPlaceholder.request, { params: registerPlaceholder.params })).status).toBe(201);

    const evolveReq = request(organization.id, project.id, 'metric-defs/evolve', {
      name: 'placeholder',
      definition: { kind: 'formula', formula: 'ad_spend / never_registered' },
      dimensions: [],
    });
    const response = await evolve(evolveReq.request, { params: evolveReq.params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_definition');
    expect(body.reasons.length).toBeGreaterThan(0);
  });
});
