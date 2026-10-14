// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, getCurrentGrowthPilot, listAuditLogEntriesForOrg, startGrowthPilot } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST } from './route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

afterEach(() => {
  getServerSessionMock.mockReset();
  delete process.env.GROWTHOS_PLATFORM_OPERATORS;
});

const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;
const request = (body: unknown) => new NextRequest('http://localhost/api/operator/growth-pilots/pause', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function pilotForCustomer() {
  const email = `${unique('owner')}@example.com`;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email });
  const { organization } = await createOrganizationWithOwner({ name: 'Customer', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const pilot = await startGrowthPilot({ organizationId: organization.id, projectId: project.id, siteUrl: 'easy-sign.co.il', actorId: owner.id });
  pilot.status = 'active';
  await pilot.save();
  return { email, orgId: organization.id, projectId: project.id };
}

async function signIn(email: string) {
  const session = { uid: unique('uid'), email, email_verified: true } as DecodedIdToken;
  await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
  getServerSessionMock.mockResolvedValue(session);
}

describe('POST /api/operator/growth-pilots/pause', () => {
  it('is a plain 404 for anyone but a platform operator - the customer included', async () => {
    const customer = await pilotForCustomer();
    expect((await POST(request({ organizationId: customer.orgId, projectId: customer.projectId, paused: true }))).status).toBe(404);
    await signIn(customer.email);
    expect((await POST(request({ organizationId: customer.orgId, projectId: customer.projectId, paused: true }))).status).toBe(404);
    expect((await getCurrentGrowthPilot(customer.orgId, customer.projectId))?.status).toBe('active');
  });

  it('lets an operator pause and resume any customer pilot, audited', async () => {
    const customer = await pilotForCustomer();
    const operator = `${unique('ops')}@growthos.io`;
    process.env.GROWTHOS_PLATFORM_OPERATORS = operator;
    await signIn(operator);
    expect((await POST(request({ organizationId: customer.orgId, projectId: 'x' }))).status).toBe(400);
    const paused = await POST(request({ organizationId: customer.orgId, projectId: customer.projectId, paused: true }));
    expect(await paused.json()).toEqual({ status: 'paused' });
    const resumed = await POST(request({ organizationId: customer.orgId, projectId: customer.projectId, paused: false }));
    expect(await resumed.json()).toEqual({ status: 'active' });
    const actions = (await listAuditLogEntriesForOrg(customer.orgId)).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['growth_pilot.paused', 'growth_pilot.resumed']));
  });
});
