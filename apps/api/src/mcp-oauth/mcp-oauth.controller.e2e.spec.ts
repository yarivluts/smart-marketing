import type { AddressInfo } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  connectFirestoreOrm,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  issueMcpAuthorizationCode,
} from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';

/**
 * Real Firestore-emulator-backed e2e coverage for KAN-75's MCP OAuth 2.1
 * protocol endpoints (discovery, dynamic client registration, `/authorize`
 * redirect, `/token`). `mcp-oauth.service.emulator.test.ts` in
 * `@growthos/firebase-orm-models` already covers the service layer in
 * depth (PKCE, single-use codes, rotation, revocation); this suite instead
 * confirms the HTTP surface — status codes, headers, the `.well-known`
 * shapes an MCP client actually discovers — end to end through a real Nest
 * app, the same posture every other `*.controller.e2e.spec.ts` in this app
 * already establishes.
 */

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8100';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await connectFirestoreOrm({ projectId: 'demo-growthos-test', emulatorHost: '127.0.0.1:8100' });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: '.well-known/oauth-authorization-server', method: RequestMethod.GET },
      { path: '.well-known/oauth-protected-resource', method: RequestMethod.GET },
      { path: 'oauth/register', method: RequestMethod.POST },
      { path: 'oauth/authorize', method: RequestMethod.GET },
      { path: 'oauth/token', method: RequestMethod.POST },
    ],
  });
  await app.init();
  await app.listen(0);
  const address = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

function makePkcePair() {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

async function registerClient(redirectUri = 'https://client.example.com/callback') {
  const res = await fetch(`${baseUrl}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'e2e test client', redirect_uris: [redirectUri] }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { client_id: string; redirect_uris: string[] };
}

describe('MCP OAuth discovery metadata (e2e)', () => {
  it('GET /.well-known/oauth-authorization-server describes the authorization-code + PKCE flow', async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
    expect(body.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(typeof body.authorization_endpoint).toBe('string');
    expect(typeof body.token_endpoint).toBe('string');
    expect(typeof body.registration_endpoint).toBe('string');
  });

  it('GET /.well-known/oauth-protected-resource points back at this authorization server', async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resource: string; authorization_servers: string[] };
    expect(body.resource.endsWith('/v1/mcp')).toBe(true);
    expect(body.authorization_servers).toHaveLength(1);
  });
});

describe('POST /oauth/register (e2e)', () => {
  it('registers a public client and returns no client_secret', async () => {
    const client = await registerClient();
    expect(client.client_id).toBeTruthy();
    expect(client.redirect_uris).toEqual(['https://client.example.com/callback']);
    const res = await fetch(`${baseUrl}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'x', redirect_uris: ['https://x.example.com'] }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('client_secret');
    expect(body.token_endpoint_auth_method).toBe('none');
  });

  it('rejects (400) an empty client_name or redirect_uris', async () => {
    const res = await fetch(`${baseUrl}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: '', redirect_uris: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /oauth/authorize (e2e)', () => {
  it('redirects (302) to the web app consent page, passing the authorization request through', async () => {
    const client = await registerClient();
    const { codeChallenge } = makePkcePair();
    const url = new URL(`${baseUrl}/oauth/authorize`);
    url.searchParams.set('client_id', client.client_id);
    url.searchParams.set('redirect_uri', client.redirect_uris[0]);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', 'xyz');

    const res = await fetch(url, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toContain('/oauth/mcp/consent');
    expect(location).toContain(`client_id=${client.client_id}`);
    expect(location).toContain('state=xyz');
  });

  it('rejects (400) an unregistered redirect_uri', async () => {
    const client = await registerClient();
    const { codeChallenge } = makePkcePair();
    const url = new URL(`${baseUrl}/oauth/authorize`);
    url.searchParams.set('client_id', client.client_id);
    url.searchParams.set('redirect_uri', 'https://evil.example.com/callback');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    const res = await fetch(url, { redirect: 'manual' });
    expect(res.status).toBe(400);
  });

  it('rejects (400) a response_type other than "code"', async () => {
    const client = await registerClient();
    const { codeChallenge } = makePkcePair();
    const url = new URL(`${baseUrl}/oauth/authorize`);
    url.searchParams.set('client_id', client.client_id);
    url.searchParams.set('redirect_uri', client.redirect_uris[0]);
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    const res = await fetch(url, { redirect: 'manual' });
    expect(res.status).toBe(400);
  });
});

describe('POST /oauth/token (e2e)', () => {
  async function setupOrgProjectOwner(orgName: string) {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
    const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    return { owner, organization, project };
  }

  it('exchanges a valid authorization code for an access/refresh token pair', async () => {
    const { owner, organization, project } = await setupOrgProjectOwner('Token Exchange Org');
    const client = await registerClient();
    const { codeVerifier, codeChallenge } = makePkcePair();

    const { code } = await issueMcpAuthorizationCode({
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      codeChallenge,
      codeChallengeMethod: 'S256',
      organizationId: organization.id,
      projectId: project.id,
      grantedByUserId: owner.id,
    });

    const res = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: client.redirect_uris[0],
        client_id: client.client_id,
        code_verifier: codeVerifier,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { access_token: string; refresh_token: string; token_type: string; scope: string };
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.token_type).toBe('Bearer');
    expect(body.scope).toBe('mcp:read');
  });

  it('rejects (400) an incorrect code_verifier', async () => {
    const { owner, organization, project } = await setupOrgProjectOwner('Bad Verifier Org');
    const client = await registerClient();
    const { codeChallenge } = makePkcePair();

    const { code } = await issueMcpAuthorizationCode({
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      codeChallenge,
      codeChallengeMethod: 'S256',
      organizationId: organization.id,
      projectId: project.id,
      grantedByUserId: owner.id,
    });

    const res = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: client.redirect_uris[0],
        client_id: client.client_id,
        code_verifier: 'wrong-verifier',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('refreshes a token pair with grant_type=refresh_token', async () => {
    const { owner, organization, project } = await setupOrgProjectOwner('Refresh Org');
    const client = await registerClient();
    const { codeVerifier, codeChallenge } = makePkcePair();

    const { code } = await issueMcpAuthorizationCode({
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      codeChallenge,
      codeChallengeMethod: 'S256',
      organizationId: organization.id,
      projectId: project.id,
      grantedByUserId: owner.id,
    });
    const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: client.redirect_uris[0],
        client_id: client.client_id,
        code_verifier: codeVerifier,
      }),
    });
    const { refresh_token: refreshToken } = (await tokenRes.json()) as { refresh_token: string };

    const refreshRes = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: client.client_id }),
    });
    expect(refreshRes.status).toBe(201);
    const refreshed = (await refreshRes.json()) as { access_token: string };
    expect(refreshed.access_token).toBeTruthy();
  });

  it('rejects (400) an unsupported grant_type', async () => {
    const res = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    });
    expect(res.status).toBe(400);
  });
});
