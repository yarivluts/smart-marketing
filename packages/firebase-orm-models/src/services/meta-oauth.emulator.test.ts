import 'reflect-metadata';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  completeMetaOAuth,
  describeMetaOAuthSession,
  ensureUserForFirebaseSession,
  finishMetaOAuth,
  generateLocalKmsKeyRing,
  listActiveAttachmentsForProject,
  listAuditLogEntriesForOrg,
  listSharedCredentials,
  LocalKmsProvider,
  MetaOAuthError,
  peekMetaOAuthSession,
  resolveAdStudioExportDestinations,
  revealSharedCredentialSecret,
  safeReturnTo,
  startMetaOAuth,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('meta-oauth-tests');
});

const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
const kms = new LocalKmsProvider(keyRing, currentKeyId);
const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;
const CONFIG = { appId: '111', appSecret: 'app-secret', redirectUri: 'https://web.example/api/integrations/meta/callback' };

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('o')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Meta Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, orgId: organization.id, projectId: project.id };
}

/** Meta's documented answers: code -> short token, fb_exchange_token -> long token, then the person's ad accounts and Pages. */
function fakeMeta(options: { expiresIn?: number; exchangeError?: string } = {}) {
  const calls: URL[] = [];
  const fetchImpl = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname.endsWith('/oauth/access_token') && url.searchParams.get('code')) {
      if (options.exchangeError) return json({ error: { message: options.exchangeError } }, 400);
      return json({ access_token: 'short-token', token_type: 'bearer' });
    }
    if (url.pathname.endsWith('/oauth/access_token') && url.searchParams.get('grant_type') === 'fb_exchange_token') {
      return json({ access_token: 'long-token', token_type: 'bearer', ...(options.expiresIn === undefined ? { expires_in: 5184000 } : options.expiresIn ? { expires_in: options.expiresIn } : {}) });
    }
    if (url.pathname.endsWith('/me/adaccounts')) return json({ data: [{ account_id: '1646897415410557', name: 'Yariv Luts', currency: 'ILS', account_status: 1, id: 'act_1646897415410557' }] });
    if (url.pathname.endsWith('/me/accounts')) return json({ data: [{ id: '1253606311170957', name: 'EasySign' }] });
    return json({ error: { message: `unexpected ${url.pathname}` } }, 404);
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe('Connect with Facebook', () => {
  it('starts with a consent URL, keeps the long-lived token sealed, and connects the picked account and Page to the project', async () => {
    const ctx = await setup();
    const now = new Date('2026-09-29T20:00:00.000Z');
    const { state, authorizeUrl } = await startMetaOAuth({ organizationId: ctx.orgId, projectId: ctx.projectId, userId: ctx.owner.id, locale: 'he', returnTo: '/he/x?step=publish', config: CONFIG, now });
    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toMatch(/^https:\/\/www\.facebook\.com\/v[\d.]+\/dialog\/oauth$/);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: '111', redirect_uri: CONFIG.redirectUri, state, response_type: 'code' });
    expect(url.searchParams.get('scope')).toBe('ads_management,ads_read,business_management,pages_show_list,pages_read_engagement');
    const custom = await startMetaOAuth({ organizationId: ctx.orgId, userId: ctx.owner.id, locale: 'en', config: { ...CONFIG, scopes: ['ads_management', 'pages_show_list'] }, now });
    expect(new URL(custom.authorizeUrl).searchParams.get('scope')).toBe('ads_management,pages_show_list');
    const withConfig = await startMetaOAuth({ organizationId: ctx.orgId, userId: ctx.owner.id, locale: 'en', config: { ...CONFIG, loginConfigId: '999' }, now });
    expect(Object.fromEntries(new URL(withConfig.authorizeUrl).searchParams)).toMatchObject({ config_id: '999' });
    expect(new URL(withConfig.authorizeUrl).searchParams.has('scope')).toBe(false);
    expect(await peekMetaOAuthSession(state)).toEqual({ organizationId: ctx.orgId, projectId: ctx.projectId, locale: 'he', returnTo: '/he/x?step=publish' });

    const meta = fakeMeta();
    const session = await completeMetaOAuth({ state, code: 'the-code', userId: ctx.owner.id, config: CONFIG, kms, fetchImpl: meta.fetchImpl, now });
    expect(JSON.stringify(session.encrypted_token)).not.toContain('long-token');
    expect(meta.calls[0].searchParams.get('client_secret')).toBe('app-secret');
    expect(meta.calls[1].searchParams.get('fb_exchange_token')).toBe('short-token');
    expect(meta.calls[2].searchParams.get('access_token')).toBe('long-token');

    const choices = await describeMetaOAuthSession({ state, userId: ctx.owner.id, now });
    expect(choices).toMatchObject({
      projectId: ctx.projectId,
      adAccounts: [{ id: '1646897415410557', name: 'Yariv Luts', currency: 'ILS', status: 1 }],
      pages: [{ id: '1253606311170957', name: 'EasySign' }],
      tokenExpiresOn: '2026-11-28T20:00:00.000Z',
    });
    expect(JSON.stringify(choices)).not.toContain('token"');

    const done = await finishMetaOAuth({ organizationId: ctx.orgId, state, userId: ctx.owner.id, adAccountId: '1646897415410557', pageId: '1253606311170957', kms, now });
    expect(done).toMatchObject({ created: true, returnTo: '/he/x?step=publish' });
    expect(done.credential).toMatchObject({ provider: 'meta_ads', available_scopes: ['1646897415410557'], connected_via: 'oauth', token_expires_on: '2026-11-28T20:00:00.000Z' });
    expect(JSON.parse(await revealSharedCredentialSecret({ organizationId: ctx.orgId, credentialId: done.credential.id, kms }))).toEqual({
      accessToken: 'long-token',
      adAccountId: '1646897415410557',
      pageId: '1253606311170957',
    });
    const [attachment] = await listActiveAttachmentsForProject(ctx.orgId, ctx.projectId);
    expect(attachment).toMatchObject({ resource_id: done.credential.id, write_tier: 'manage', scope_selection: ['1646897415410557'] });
    // Ad Studio can now publish to Meta for this project.
    expect((await resolveAdStudioExportDestinations(ctx.orgId, ctx.projectId)).meta).toMatchObject({ available: true, credentialId: done.credential.id });
    expect((await listAuditLogEntriesForOrg(ctx.orgId, 20)).some((entry) => entry.action === 'meta.connected')).toBe(true);
    // The session is single-use.
    await expect(describeMetaOAuthSession({ state, userId: ctx.owner.id, now })).rejects.toMatchObject({ code: 'session_not_found' });
  });

  it('reconnecting the same ad account refreshes the existing credential instead of adding another', async () => {
    const ctx = await setup();
    const connect = async (expiresIn: number) => {
      const { state } = await startMetaOAuth({ organizationId: ctx.orgId, projectId: ctx.projectId, userId: ctx.owner.id, locale: 'en', config: CONFIG });
      await completeMetaOAuth({ state, code: 'c', userId: ctx.owner.id, config: CONFIG, kms, fetchImpl: fakeMeta({ expiresIn }).fetchImpl });
      return finishMetaOAuth({ organizationId: ctx.orgId, state, userId: ctx.owner.id, adAccountId: '1646897415410557', pageId: '1253606311170957', kms });
    };
    const first = await connect(5184000);
    const second = await connect(0);
    expect(second.created).toBe(false);
    expect(second.credential.id).toBe(first.credential.id);
    expect(second.credential.token_expires_on).toBeNull();
    expect((await listSharedCredentials(ctx.orgId)).filter((credential) => credential.provider === 'meta_ads')).toHaveLength(1);
    expect(await listActiveAttachmentsForProject(ctx.orgId, ctx.projectId)).toHaveLength(1);
    expect((await listAuditLogEntriesForOrg(ctx.orgId, 20)).some((entry) => entry.action === 'meta.reconnected')).toBe(true);
  });

  it('refuses another user, an expired session, a choice Meta did not offer, and reports a failed exchange', async () => {
    const ctx = await setup();
    const other = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('x')}@example.com` });
    const now = new Date('2026-09-29T20:00:00.000Z');
    const { state } = await startMetaOAuth({ organizationId: ctx.orgId, userId: ctx.owner.id, locale: 'en', config: CONFIG, now });
    await expect(completeMetaOAuth({ state, code: 'c', userId: other.id, config: CONFIG, kms, fetchImpl: fakeMeta().fetchImpl, now })).rejects.toMatchObject({ code: 'wrong_user' });
    await expect(completeMetaOAuth({ state, code: 'c', userId: ctx.owner.id, config: CONFIG, kms, fetchImpl: fakeMeta({ exchangeError: 'Invalid verification code' }).fetchImpl, now })).rejects.toMatchObject({
      code: 'exchange_failed',
      message: 'Invalid verification code',
    });
    await completeMetaOAuth({ state, code: 'c', userId: ctx.owner.id, config: CONFIG, kms, fetchImpl: fakeMeta().fetchImpl, now });
    await expect(finishMetaOAuth({ organizationId: ctx.orgId, state, userId: ctx.owner.id, adAccountId: '999', pageId: '1253606311170957', kms, now })).rejects.toBeInstanceOf(MetaOAuthError);
    await expect(finishMetaOAuth({ organizationId: 'another-org', state, userId: ctx.owner.id, adAccountId: '1646897415410557', pageId: '1253606311170957', kms, now })).rejects.toMatchObject({ code: 'session_not_found' });
    await expect(finishMetaOAuth({ organizationId: ctx.orgId, state, userId: ctx.owner.id, adAccountId: '1646897415410557', pageId: '1253606311170957', projectId: 'no-such-project', kms, now })).rejects.toMatchObject({ name: 'ProjectNotFoundError' });
    // Nothing was written by the refused attempts.
    expect((await listSharedCredentials(ctx.orgId)).filter((credential) => credential.provider === 'meta_ads')).toHaveLength(0);
    await expect(describeMetaOAuthSession({ state, userId: ctx.owner.id, now: new Date(now.getTime() + 16 * 60 * 1000) })).rejects.toMatchObject({ code: 'session_expired' });
    await expect(describeMetaOAuthSession({ state: 'not-a-real-state', userId: ctx.owner.id, now })).rejects.toMatchObject({ code: 'session_not_found' });
  });

  it('only returns to app-relative paths', () => {
    expect(safeReturnTo('/en/orgs/o/projects/p/ad-studio?brief=b&step=publish')).toBe('/en/orgs/o/projects/p/ad-studio?brief=b&step=publish');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '', null]) expect(safeReturnTo(bad)).toBeNull();
  });
});
