import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  McpOAuthGrantModel,
  registerMcpOAuthClient,
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

function fakeSession(overrides: Partial<DecodedIdToken> = {}): DecodedIdToken {
  const unique_ = Math.random().toString(36).slice(2);
  return { uid: `uid-${unique_}`, email: `owner-${unique_}@example.com`, ...overrides } as DecodedIdToken;
}

async function setupProjectWithOwner(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

async function setupClient(redirectUri = 'https://client.example.com/callback') {
  return registerMcpOAuthClient({ clientName: 'Test MCP Client', redirectUris: [redirectUri] });
}

function createRequest(fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields);
  return new Request('https://growthos.test/api/oauth/mcp/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

describe('POST /api/oauth/mcp/consent', () => {
  it('rejects a request missing client_id, redirect_uri, or code_challenge', async () => {
    const response = await POST(createRequest({ redirect_uri: 'https://x.example.com', code_challenge: 'abc' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
  });

  it('rejects an unregistered client_id/redirect_uri pair before checking auth', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const client = await setupClient();

    const response = await POST(
      createRequest({
        client_id: client.id,
        redirect_uri: 'https://not-registered.example.com/callback',
        code_challenge: 'abc',
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_client' });
    expect(getServerSessionMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated caller once client/redirect_uri are valid', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const client = await setupClient();

    const response = await POST(
      createRequest({ client_id: client.id, redirect_uri: client.redirect_uris[0], code_challenge: 'abc' }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthenticated' });
  });

  it('redirects with access_denied when the user denies consent, preserving state', async () => {
    const session = fakeSession();
    getServerSessionMock.mockResolvedValue(session);
    const client = await setupClient();

    const response = await POST(
      createRequest({
        client_id: client.id,
        redirect_uri: client.redirect_uris[0],
        code_challenge: 'abc',
        state: 'xyz-state',
        decision: 'deny',
      }),
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(client.redirect_uris[0]);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('state')).toBe('xyz-state');
    expect(location.searchParams.has('code')).toBe(false);
  });

  it('redirects with access_denied for any decision other than approve, without touching target', async () => {
    const session = fakeSession();
    getServerSessionMock.mockResolvedValue(session);
    const client = await setupClient();

    const response = await POST(
      createRequest({ client_id: client.id, redirect_uri: client.redirect_uris[0], code_challenge: 'abc', decision: '' }),
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('access_denied');
  });

  it('redirects with invalid_request when target is missing an organization or project half', async () => {
    const session = fakeSession();
    getServerSessionMock.mockResolvedValue(session);
    const client = await setupClient();

    const response = await POST(
      createRequest({
        client_id: client.id,
        redirect_uri: client.redirect_uris[0],
        code_challenge: 'abc',
        decision: 'approve',
        target: 'only-an-org-id',
        state: 'state-1',
      }),
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('invalid_request');
    expect(location.searchParams.get('state')).toBe('state-1');
  });

  it('redirects with access_denied when the caller lacks mcp.read for the chosen project', async () => {
    const { organization, project } = await setupProjectWithOwner('No Permission Org');
    const outsider = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('outsider') });
    getServerSessionMock.mockResolvedValue({ uid: outsider.firebaseUid, email: outsider.email } as DecodedIdToken);
    const client = await setupClient();

    const response = await POST(
      createRequest({
        client_id: client.id,
        redirect_uri: client.redirect_uris[0],
        code_challenge: 'abc',
        code_challenge_method: 'S256',
        decision: 'approve',
        target: `${organization.id}:${project.id}`,
      }),
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.has('code')).toBe(false);
  });

  it('redirects with access_denied when the project does not exist in the organization', async () => {
    const { owner, organization } = await setupProjectWithOwner('Bad Project Org');
    getServerSessionMock.mockResolvedValue({ uid: owner.firebaseUid, email: owner.email } as DecodedIdToken);
    const client = await setupClient();

    const response = await POST(
      createRequest({
        client_id: client.id,
        redirect_uri: client.redirect_uris[0],
        code_challenge: 'abc',
        code_challenge_method: 'S256',
        decision: 'approve',
        target: `${organization.id}:not-a-real-project`,
      }),
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('access_denied');
  });

  it('mints and redirects with an authorization code for an eligible, approving user, persisting a real grant', async () => {
    const { owner, organization, project } = await setupProjectWithOwner('Full Flow Org');
    getServerSessionMock.mockResolvedValue({ uid: owner.firebaseUid, email: owner.email } as DecodedIdToken);
    const client = await setupClient();

    const response = await POST(
      createRequest({
        client_id: client.id,
        redirect_uri: client.redirect_uris[0],
        code_challenge: 'a-real-challenge',
        code_challenge_method: 'S256',
        decision: 'approve',
        target: `${organization.id}:${project.id}`,
        state: 'round-trip-state',
      }),
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(client.redirect_uris[0]);
    expect(location.searchParams.get('state')).toBe('round-trip-state');
    expect(location.searchParams.has('error')).toBe(false);
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();

    const grants = await McpOAuthGrantModel.query()
      .where('organization_id', '==', organization.id)
      .where('project_id', '==', project.id)
      .get();
    expect(grants).toHaveLength(1);
    expect(grants[0].client_id).toBe(client.id);
    expect(grants[0].granted_by_user_id).toBe(owner.id);
    expect(grants[0].code_challenge).toBe('a-real-challenge');
  });
});
