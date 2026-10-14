// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  listActiveAttachmentsForProject,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST as connect } from './route';
import { POST as check } from './[credentialId]/check/route';
import { PUT as setSecret } from '../resources/credentials/[credentialId]/secret/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({ currentKeyId: 'v1', keys: { v1: randomBytes(32).toString('base64') } });
  await ensureFirestoreOrm();
});

afterEach(() => {
  vi.unstubAllGlobals();
  getServerSessionMock.mockReset();
});

const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) });
}

async function setup() {
  const uid = unique('uid');
  const email = `${unique('owner')}@example.com`;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  const { organization } = await createOrganizationWithOwner({ name: 'Ads Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  getServerSessionMock.mockResolvedValue({ uid, email } as DecodedIdToken);
  return { owner, orgId: organization.id, projectId: project.id, p: { params: Promise.resolve({ orgId: organization.id }) } };
}

describe('ad platform connection routes', () => {
  it('connects TikTok to a project only once TikTok answers, re-checks it, and names fields to fix', async () => {
    const ctx = await setup();
    const bad = await connect(request('POST', { provider: 'tiktok_ads', fields: { accessToken: '', advertiserId: 'x' } }), ctx.p);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_details', fields: ['accessToken', 'advertiserId'] });
    expect((await connect(request('POST', { provider: 'myspace', fields: {} }), ctx.p)).status).toBe(400);

    vi.stubGlobal('fetch', vi.fn(async () => json({ code: 40105, message: 'bad token' })));
    const refused = await connect(request('POST', { provider: 'tiktok_ads', fields: { accessToken: 'tt', advertiserId: '700' }, projectId: ctx.projectId }), ctx.p);
    expect(await refused.json()).toEqual({ check: { status: 'failed', reason: 'auth_failed' }, created: false, connection: null });

    vi.stubGlobal('fetch', vi.fn(async () => json({ code: 0, data: { list: [{ name: 'EasySign TT', status: 'STATUS_ENABLE', currency: 'USD' }] } })));
    const ok = await connect(request('POST', { provider: 'tiktok_ads', fields: { accessToken: 'tt', advertiserId: '700' }, projectId: ctx.projectId }), ctx.p);
    const body = (await ok.json()) as { check: { status: string }; connection: { id: string; accountName: string; lastCheckStatus: string; hasSecret: boolean } & Record<string, unknown> };
    expect(body.check.status).toBe('ok');
    expect(body.connection).toMatchObject({ provider: 'tiktok_ads', accountId: '700', accountName: 'EasySign TT', lastCheckStatus: 'ok', hasSecret: true });
    // The view never carries the secret.
    expect(JSON.stringify(body)).not.toContain('"tt"');
    expect(await listActiveAttachmentsForProject(ctx.orgId, ctx.projectId)).toHaveLength(1);

    vi.stubGlobal('fetch', vi.fn(async () => json({ code: 0, data: { list: [{ name: 'EasySign TT', status: 'STATUS_DISABLE' }] } })));
    const rechecked = await check(request('POST'), { params: Promise.resolve({ orgId: ctx.orgId, credentialId: body.connection.id }) });
    expect(await rechecked.json()).toMatchObject({ check: { status: 'failed', reason: 'account_disabled' }, connection: { lastCheckStatus: 'account_disabled' } });
  });

  it('refuses a malformed ad platform secret when it is saved by hand', async () => {
    const ctx = await setup();
    const credential = await createSharedCredential({ organizationId: ctx.orgId, name: 'Google', provider: 'google_ads', availableScopes: ['1'], createdByUserId: ctx.owner.id });
    const params = { params: Promise.resolve({ orgId: ctx.orgId, credentialId: credential.id }) };
    const refused = await setSecret(request('PUT', { secret: '{"developerToken":"only"}' }), params);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: 'invalid_secret' });
    const saved = await setSecret(request('PUT', { secret: JSON.stringify({ developerToken: 'd', clientId: 'c', clientSecret: 's', refreshToken: 'r', customerId: '1234567890' }) }), params);
    expect(saved.status).toBe(200);
  });

  it('needs resources.manage: an editor can neither connect nor check', async () => {
    const ctx = await setup();
    const email = `${unique('editor')}@example.com`;
    const invitation = await inviteMemberToOrganization({ organizationId: ctx.orgId, email, role: 'editor', invitedByUserId: ctx.owner.id, projectId: ctx.projectId });
    const uid = unique('uid');
    const editor = await ensureUserForFirebaseSession({ firebaseUid: uid, email });
    await acceptInvite({ organizationId: ctx.orgId, membershipId: invitation.id, userId: editor.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue({ uid, email } as DecodedIdToken);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect([403, 404]).toContain((await connect(request('POST', { provider: 'tiktok_ads', fields: { accessToken: 'tt', advertiserId: '700' } }), ctx.p)).status);
    expect([403, 404]).toContain((await check(request('POST'), { params: Promise.resolve({ orgId: ctx.orgId, credentialId: 'x' }) })).status);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
