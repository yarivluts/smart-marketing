// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  listActiveAttachmentsForProject,
  resolveAdStudioExportDestinations,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET as start } from './start/route';
import { GET as callback } from './callback/route';
import { POST as finish } from '../../orgs/[orgId]/integrations/meta/finish/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

const WEB = 'https://web.example';

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({ currentKeyId: 'v1', keys: { v1: randomBytes(32).toString('base64') } });
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
  process.env.META_APP_ID = '111';
  process.env.META_APP_SECRET = 'app-secret';
  process.env.GROWTHOS_PUBLIC_WEB_URL = WEB;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
  delete process.env.GROWTHOS_PUBLIC_WEB_URL;
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function sessionFor(email: string): Promise<DecodedIdToken> {
  const uid = unique('uid');
  await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  return { uid, email } as DecodedIdToken;
}

async function setup() {
  const ownerSession = await sessionFor(`${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: 'Meta Connect Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  getServerSessionMock.mockResolvedValue(ownerSession);
  return { ownerSession, owner, orgId: organization.id, projectId: project.id };
}

function fakeMeta() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/oauth/access_token')) return Response.json({ access_token: url.searchParams.get('code') ? 'short' : 'long-token', expires_in: 5184000 });
      if (url.pathname.endsWith('/me/adaccounts')) return Response.json({ data: [{ account_id: '1646897415410557', name: 'Yariv Luts', currency: 'ILS', account_status: 1 }] });
      if (url.pathname.endsWith('/me/accounts')) return Response.json({ data: [{ id: '1253606311170957', name: 'EasySign' }] });
      return Response.json({ error: { message: 'unexpected' } }, { status: 404 });
    }),
  );
}

const get = (path: string) => new NextRequest(`${WEB}${path}`);

async function startFor(ctx: Awaited<ReturnType<typeof setup>>, extra = '') {
  const response = await start(get(`/api/integrations/meta/start?orgId=${ctx.orgId}&projectId=${ctx.projectId}&locale=he${extra}`));
  expect(response.status).toBe(302);
  return new URL(response.headers.get('location') as string);
}

describe('Connect with Facebook routes', () => {
  it('sends the person to Meta, returns them to pick an account, and connects it so Ad Studio can publish', async () => {
    const ctx = await setup();
    const returnTo = encodeURIComponent(`/he/orgs/${ctx.orgId}/projects/${ctx.projectId}/ad-studio?brief=b1&step=publish`);
    const dialog = await startFor(ctx, `&returnTo=${returnTo}`);
    expect(dialog.hostname).toBe('www.facebook.com');
    expect(dialog.searchParams.get('redirect_uri')).toBe(`${WEB}/api/integrations/meta/callback`);
    expect(dialog.searchParams.get('client_id')).toBe('111');
    const state = dialog.searchParams.get('state') as string;

    fakeMeta();
    const back = await callback(get(`/api/integrations/meta/callback?code=abc&state=${state}`));
    expect(back.status).toBe(302);
    expect(back.headers.get('location')).toBe(`${WEB}/he/orgs/${ctx.orgId}/integrations/meta?session=${state}`);

    const done = await finish(
      new NextRequest(`${WEB}/api/orgs/${ctx.orgId}/integrations/meta/finish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session: state, adAccountId: '1646897415410557', pageId: '1253606311170957', projectId: ctx.projectId }),
      }),
      { params: Promise.resolve({ orgId: ctx.orgId }) },
    );
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ created: true, returnTo: decodeURIComponent(returnTo) });
    expect(await listActiveAttachmentsForProject(ctx.orgId, ctx.projectId)).toHaveLength(1);
    expect((await resolveAdStudioExportDestinations(ctx.orgId, ctx.projectId)).meta.available).toBe(true);
  });

  it('lands on the connect page with a reason when Meta declines, when no app is configured, and for another org', async () => {
    const ctx = await setup();
    const state = (await startFor(ctx)).searchParams.get('state') as string;
    const declined = await callback(get(`/api/integrations/meta/callback?error=access_denied&state=${state}`));
    expect(declined.headers.get('location')).toBe(`${WEB}/he/orgs/${ctx.orgId}/integrations/meta?error=declined`);
    const refused = await callback(get(`/api/integrations/meta/callback?error_code=1349048&error_message=${encodeURIComponent("Can't load URL: the domain isn't included")}&state=${state}`));
    const refusedTo = new URL(refused.headers.get('location') as string);
    expect(refusedTo.pathname).toBe(`/he/orgs/${ctx.orgId}/integrations/meta`);
    expect(Object.fromEntries(refusedTo.searchParams)).toEqual({ error: 'meta_error', detail: "Can't load URL: the domain isn't included" });

    delete process.env.META_APP_ID;
    const unconfigured = await start(get(`/api/integrations/meta/start?orgId=${ctx.orgId}&locale=en`));
    expect(unconfigured.headers.get('location')).toBe(`${WEB}/en/orgs/${ctx.orgId}/integrations/meta?error=not_configured`);
    process.env.META_APP_ID = '111';

    const other = await setup();
    const otherState = (await startFor(other)).searchParams.get('state') as string;
    fakeMeta();
    await callback(get(`/api/integrations/meta/callback?code=abc&state=${otherState}`));
    // The first org's owner cannot finish the other org's session through their own org: refused before anything is written.
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const crossed = await finish(
      new NextRequest(`${WEB}/x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session: otherState, adAccountId: '1646897415410557', pageId: '1253606311170957' }) }),
      { params: Promise.resolve({ orgId: ctx.orgId }) },
    );
    expect(crossed.status).toBe(409);
    expect(await crossed.json()).toMatchObject({ error: expect.stringMatching(/^(wrong_user|session_not_found)$/) });
    expect(await listActiveAttachmentsForProject(other.orgId, other.projectId)).toHaveLength(0);
  });

  it('needs resources.manage: a project editor cannot start a connection', async () => {
    const ctx = await setup();
    const email = `${unique('editor')}@example.com`;
    const invitation = await inviteMemberToOrganization({ organizationId: ctx.orgId, email, role: 'editor', invitedByUserId: ctx.owner.id, projectId: ctx.projectId });
    const editorSession = await sessionFor(email);
    const editor = await ensureUserForFirebaseSession({ firebaseUid: editorSession.uid, email });
    await acceptInvite({ organizationId: ctx.orgId, membershipId: invitation.id, userId: editor.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue(editorSession);
    expect([403, 404]).toContain((await start(get(`/api/integrations/meta/start?orgId=${ctx.orgId}&locale=en`))).status);
  });
});
