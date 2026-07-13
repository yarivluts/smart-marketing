import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  authenticateMcpAccessToken,
  createOrganizationWithOwner,
  createProject,
  currentUserHasMcpReadPermission,
  ensureUserForFirebaseSession,
  exchangeMcpAuthorizationCode,
  InsufficientMcpReadPermissionError,
  InvalidMcpOAuthClientError,
  issueMcpAuthorizationCode,
  listMcpOAuthGrantsForProject,
  MCP_READ_SCOPE,
  refreshMcpAccessToken,
  registerMcpOAuthClient,
  revokeMcpOAuthGrant,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-75's MCP OAuth 2.1 authorization server: dynamic client registration, authorization-code + PKCE, refresh rotation, and immediate revocation. */

beforeAll(async () => {
  await connectToFirestoreEmulator('mcp-oauth-service-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

function makePkcePair() {
  const codeVerifier = unique('verifier');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
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

describe('registerMcpOAuthClient', () => {
  it('registers a public client with a redirect_uris allow-list', async () => {
    const client = await registerMcpOAuthClient({
      clientName: 'Claude Desktop',
      redirectUris: ['https://claude.ai/api/mcp/callback', 'http://127.0.0.1:33418/callback'],
    });

    expect(client.client_name).toBe('Claude Desktop');
    expect(client.redirect_uris).toEqual(['https://claude.ai/api/mcp/callback', 'http://127.0.0.1:33418/callback']);
  });

  it('rejects an empty client_name or redirect_uris list', async () => {
    await expect(registerMcpOAuthClient({ clientName: '  ', redirectUris: ['https://x.example.com'] })).rejects.toBeInstanceOf(
      InvalidMcpOAuthClientError,
    );
    await expect(registerMcpOAuthClient({ clientName: 'x', redirectUris: [] })).rejects.toBeInstanceOf(InvalidMcpOAuthClientError);
    await expect(registerMcpOAuthClient({ clientName: 'x', redirectUris: ['not-a-uri'] })).rejects.toBeInstanceOf(
      InvalidMcpOAuthClientError,
    );
  });
});

describe('currentUserHasMcpReadPermission', () => {
  it('grants the org owner (ALL_PERMISSIONS) and denies a non-member', async () => {
    const { owner, organization } = await setupProjectWithOwner('Permission Org');
    const outsider = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('outsider') });

    expect(await currentUserHasMcpReadPermission(owner.id, organization.id)).toBe(true);
    expect(await currentUserHasMcpReadPermission(outsider.id, organization.id)).toBe(false);
  });
});

describe('issueMcpAuthorizationCode + exchangeMcpAuthorizationCode', () => {
  it('mints a code for a permitted user and exchanges it for a token pair with valid PKCE', async () => {
    const { owner, organization, project } = await setupProjectWithOwner('Full Flow Org');
    const client = await setupClient();
    const { codeVerifier, codeChallenge } = makePkcePair();

    const { code } = await issueMcpAuthorizationCode({
      clientId: client.id,
      redirectUri: client.redirect_uris[0],
      codeChallenge,
      codeChallengeMethod: 'S256',
      organizationId: organization.id,
      projectId: project.id,
      grantedByUserId: owner.id,
    });

    const result = await exchangeMcpAuthorizationCode({
      code,
      clientId: client.id,
      redirectUri: client.redirect_uris[0],
      codeVerifier,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accessToken).toBeTruthy();
      expect(result.value.refreshToken).toBeTruthy();
      expect(result.value.scope).toBe(MCP_READ_SCOPE);
      expect(result.value.expiresInSeconds).toBeGreaterThan(0);
    }
  });

  it('rejects issuing a code for a user who lacks mcp.read in the project', async () => {
    const { organization, project } = await setupProjectWithOwner('No Permission Org');
    const outsider = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('outsider') });
    const client = await setupClient();
    const { codeChallenge } = makePkcePair();

    await expect(
      issueMcpAuthorizationCode({
        clientId: client.id,
        redirectUri: client.redirect_uris[0],
        codeChallenge,
        codeChallengeMethod: 'S256',
        organizationId: organization.id,
        projectId: project.id,
        grantedByUserId: outsider.id,
      }),
    ).rejects.toBeInstanceOf(InsufficientMcpReadPermissionError);
  });

  it('rejects a redirect_uri not registered for the client', async () => {
    const { owner, organization, project } = await setupProjectWithOwner('Bad Redirect Org');
    const client = await setupClient();
    const { codeChallenge } = makePkcePair();

    await expect(
      issueMcpAuthorizationCode({
        clientId: client.id,
        redirectUri: 'https://evil.example.com/callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
        organizationId: organization.id,
        projectId: project.id,
        grantedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidMcpOAuthClientError);
  });

  it('rejects a code_challenge_method other than S256', async () => {
    const { owner, organization, project } = await setupProjectWithOwner('Plain PKCE Org');
    const client = await setupClient();

    await expect(
      issueMcpAuthorizationCode({
        clientId: client.id,
        redirectUri: client.redirect_uris[0],
        codeChallenge: 'whatever',
        codeChallengeMethod: 'plain',
        organizationId: organization.id,
        projectId: project.id,
        grantedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidMcpOAuthClientError);
  });

  it('rejects exchanging with the wrong code_verifier', async () => {
    const { owner, organization, project } = await setupProjectWithOwner('Wrong Verifier Org');
    const client = await setupClient();
    const { codeChallenge } = makePkcePair();

    const { code } = await issueMcpAuthorizationCode({
      clientId: client.id,
      redirectUri: client.redirect_uris[0],
      codeChallenge,
      codeChallengeMethod: 'S256',
      organizationId: organization.id,
      projectId: project.id,
      grantedByUserId: owner.id,
    });

    const result = await exchangeMcpAuthorizationCode({
      code,
      clientId: client.id,
      redirectUri: client.redirect_uris[0],
      codeVerifier: 'not-the-real-verifier',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('invalid_code_verifier');
    }
  });

  it('rejects redeeming the same code twice (single-use)', async () => {
    const { owner, organization, project } = await setupProjectWithOwner('Single Use Org');
    const client = await setupClient();
    const { codeVerifier, codeChallenge } = makePkcePair();

    const { code } = await issueMcpAuthorizationCode({
      clientId: client.id,
      redirectUri: client.redirect_uris[0],
      codeChallenge,
      codeChallengeMethod: 'S256',
      organizationId: organization.id,
      projectId: project.id,
      grantedByUserId: owner.id,
    });

    const exchangeParams = { code, clientId: client.id, redirectUri: client.redirect_uris[0], codeVerifier };
    const first = await exchangeMcpAuthorizationCode(exchangeParams);
    expect(first.ok).toBe(true);

    const second = await exchangeMcpAuthorizationCode(exchangeParams);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.reason).toBe('invalid_grant');
    }
  });
});

describe('authenticateMcpAccessToken', () => {
  it('resolves the org/project/user behind a live token and re-checks permission fresh', async () => {
    const { owner, organization, project } = await setupProjectWithOwner('Auth Token Org');
    const client = await setupClient();
    const { codeVerifier, codeChallenge } = makePkcePair();

    const { code } = await issueMcpAuthorizationCode({
      clientId: client.id,
      redirectUri: client.redirect_uris[0],
      codeChallenge,
      codeChallengeMethod: 'S256',
      organizationId: organization.id,
      projectId: project.id,
      grantedByUserId: owner.id,
    });
    const exchanged = await exchangeMcpAuthorizationCode({ code, clientId: client.id, redirectUri: client.redirect_uris[0], codeVerifier });
    if (!exchanged.ok) throw new Error('exchange failed');

    const result = await authenticateMcpAccessToken(exchanged.value.accessToken);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.organizationId).toBe(organization.id);
      expect(result.value.projectId).toBe(project.id);
      expect(result.value.userId).toBe(owner.id);
      expect(result.value.scope).toBe(MCP_READ_SCOPE);
    }
  });

  it('rejects an unknown token', async () => {
    const result = await authenticateMcpAccessToken('not-a-real-token');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('invalid_token');
    }
  });
});

describe('refreshMcpAccessToken', () => {
  it('rotates both access and refresh tokens, invalidating the old refresh token', async () => {
    const { owner, organization, project } = await setupProjectWithOwner('Refresh Org');
    const client = await setupClient();
    const { codeVerifier, codeChallenge } = makePkcePair();

    const { code } = await issueMcpAuthorizationCode({
      clientId: client.id,
      redirectUri: client.redirect_uris[0],
      codeChallenge,
      codeChallengeMethod: 'S256',
      organizationId: organization.id,
      projectId: project.id,
      grantedByUserId: owner.id,
    });
    const exchanged = await exchangeMcpAuthorizationCode({ code, clientId: client.id, redirectUri: client.redirect_uris[0], codeVerifier });
    if (!exchanged.ok) throw new Error('exchange failed');

    const refreshed = await refreshMcpAccessToken({ refreshToken: exchanged.value.refreshToken, clientId: client.id });
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(refreshed.value.accessToken).not.toBe(exchanged.value.accessToken);
    expect(refreshed.value.refreshToken).not.toBe(exchanged.value.refreshToken);

    // The old access token no longer authenticates.
    const staleAuth = await authenticateMcpAccessToken(exchanged.value.accessToken);
    expect(staleAuth.ok).toBe(false);

    // The new access token does.
    const freshAuth = await authenticateMcpAccessToken(refreshed.value.accessToken);
    expect(freshAuth.ok).toBe(true);

    // The old refresh token is now dead too (rotation).
    const staleRefresh = await refreshMcpAccessToken({ refreshToken: exchanged.value.refreshToken, clientId: client.id });
    expect(staleRefresh.ok).toBe(false);
  });
});

describe('revokeMcpOAuthGrant + listMcpOAuthGrantsForProject', () => {
  it('is immediate: a revoked grant fails token auth on the very next call', async () => {
    const { owner, organization, project } = await setupProjectWithOwner('Revoke Org');
    const client = await setupClient();
    const { codeVerifier, codeChallenge } = makePkcePair();

    const { code, grant } = await issueMcpAuthorizationCode({
      clientId: client.id,
      redirectUri: client.redirect_uris[0],
      codeChallenge,
      codeChallengeMethod: 'S256',
      organizationId: organization.id,
      projectId: project.id,
      grantedByUserId: owner.id,
    });
    const exchanged = await exchangeMcpAuthorizationCode({ code, clientId: client.id, redirectUri: client.redirect_uris[0], codeVerifier });
    if (!exchanged.ok) throw new Error('exchange failed');

    const before = await authenticateMcpAccessToken(exchanged.value.accessToken);
    expect(before.ok).toBe(true);

    await revokeMcpOAuthGrant({ organizationId: organization.id, projectId: project.id, grantId: grant.id, revokedByUserId: owner.id });

    const after = await authenticateMcpAccessToken(exchanged.value.accessToken);
    expect(after.ok).toBe(false);
    if (!after.ok) {
      expect(after.error.reason).toBe('invalid_token');
    }
  });

  it('lists every grant issued for a project, active and revoked', async () => {
    const { owner, organization, project } = await setupProjectWithOwner('List Grants Org');
    const client = await setupClient();
    const { codeChallenge } = makePkcePair();

    const { grant } = await issueMcpAuthorizationCode({
      clientId: client.id,
      redirectUri: client.redirect_uris[0],
      codeChallenge,
      codeChallengeMethod: 'S256',
      organizationId: organization.id,
      projectId: project.id,
      grantedByUserId: owner.id,
    });

    const before = await listMcpOAuthGrantsForProject(organization.id, project.id);
    expect(before).toHaveLength(1);
    expect(before[0].id).toBe(grant.id);
    expect(before[0].isActive).toBe(false); // code minted but never redeemed for a token yet

    await revokeMcpOAuthGrant({ organizationId: organization.id, projectId: project.id, grantId: grant.id, revokedByUserId: owner.id });
    const after = await listMcpOAuthGrantsForProject(organization.id, project.id);
    expect(after[0].revokedAt).toBeTruthy();
  });
});
