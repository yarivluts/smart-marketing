import 'reflect-metadata';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AdPlatformDetailsInvalidError,
  checkAdPlatformConnection,
  connectAdPlatform,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  listActiveAttachmentsForProject,
  listAuditLogEntriesForOrg,
  listSharedCredentials,
  LocalKmsProvider,
  NotAnAdPlatformCredentialError,
  createSharedCredential,
  resolveAdStudioExportDestinations,
  revealSharedCredentialSecret,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-platform-connection-tests');
});

const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
const kms = new LocalKmsProvider(keyRing, currentKeyId);
const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('o')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Ads Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, orgId: organization.id, projectId: project.id };
}

const TIKTOK_FIELDS = { accessToken: 'tt-token', advertiserId: '7000 0000' };
const tiktok = (status = 'STATUS_ENABLE') => vi.fn(async () => json({ code: 0, data: { list: [{ name: 'EasySign TT', status, currency: 'USD' }] } })) as unknown as typeof fetch;

describe('connecting an ad platform', () => {
  it('saves a connection only once the platform answers, attaches it to the project to create ads, and audits it', async () => {
    const ctx = await setup();
    const failing = await connectAdPlatform({ organizationId: ctx.orgId, provider: 'tiktok_ads', fields: TIKTOK_FIELDS, projectId: ctx.projectId, actorId: ctx.owner.id, kms, fetchImpl: vi.fn(async () => json({ code: 40105 })) as unknown as typeof fetch });
    expect(failing).toEqual({ check: { status: 'failed', reason: 'auth_failed' }, credential: null, attachment: null, created: false });
    expect(await listSharedCredentials(ctx.orgId)).toHaveLength(0);

    const now = new Date('2026-10-14T12:00:00.000Z');
    const connected = await connectAdPlatform({ organizationId: ctx.orgId, provider: 'tiktok_ads', fields: TIKTOK_FIELDS, projectId: ctx.projectId, actorId: ctx.owner.id, kms, fetchImpl: tiktok(), now });
    expect(connected.created).toBe(true);
    expect(connected.credential).toMatchObject({ name: 'TikTok Ads - EasySign TT (70000000)', provider: 'tiktok_ads', available_scopes: ['70000000'], last_check_status: 'ok', last_checked_on: now.toISOString(), last_check_account: { id: '70000000', name: 'EasySign TT', currency: 'USD' } });
    expect(JSON.parse(await revealSharedCredentialSecret({ organizationId: ctx.orgId, credentialId: connected.credential!.id, kms }))).toEqual({ accessToken: 'tt-token', advertiserId: '70000000' });
    const [attachment] = await listActiveAttachmentsForProject(ctx.orgId, ctx.projectId);
    expect(attachment).toMatchObject({ resource_id: connected.credential!.id, write_tier: 'manage', scope_selection: ['70000000'] });
    expect((await listAuditLogEntriesForOrg(ctx.orgId)).map((entry) => entry.action)).toContain('ad_platform.connected');

    // The same account again replaces the details on the same connection.
    const again = await connectAdPlatform({ organizationId: ctx.orgId, provider: 'tiktok_ads', fields: { ...TIKTOK_FIELDS, accessToken: 'new-token' }, projectId: ctx.projectId, actorId: ctx.owner.id, kms, fetchImpl: tiktok() });
    expect(again.created).toBe(false);
    expect(again.credential!.id).toBe(connected.credential!.id);
    expect(await listSharedCredentials(ctx.orgId)).toHaveLength(1);
    expect(await listActiveAttachmentsForProject(ctx.orgId, ctx.projectId)).toHaveLength(1);
  });

  it('a Meta connection made here is what Ad Studio publishes through', async () => {
    const ctx = await setup();
    const meta = vi.fn(async (input: string | URL) => (new URL(String(input)).pathname.includes('/act_') ? json({ name: 'Yariv Luts', account_status: 1, currency: 'ILS' }) : json({ name: 'EasySign' }))) as unknown as typeof fetch;
    await connectAdPlatform({ organizationId: ctx.orgId, provider: 'meta_ads', fields: { accessToken: 'tok', adAccountId: 'act_1646897415410557', pageId: '1253606311170957' }, projectId: ctx.projectId, actorId: ctx.owner.id, kms, fetchImpl: meta });
    expect((await resolveAdStudioExportDestinations(ctx.orgId, ctx.projectId)).meta).toMatchObject({ available: true });
  });

  it('refuses malformed details by field, before calling the platform', async () => {
    const ctx = await setup();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(connectAdPlatform({ organizationId: ctx.orgId, provider: 'google_ads', fields: { developerToken: 'd', customerId: 'abc' }, actorId: ctx.owner.id, kms, fetchImpl })).rejects.toMatchObject({
      name: 'AdPlatformDetailsInvalidError',
      fields: ['clientId', 'clientSecret', 'refreshToken', 'customerId'],
    });
    await expect(connectAdPlatform({ organizationId: ctx.orgId, provider: 'tiktok_ads', fields: {}, actorId: ctx.owner.id, kms, fetchImpl })).rejects.toBeInstanceOf(AdPlatformDetailsInvalidError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('re-checks a saved connection and keeps the outcome, and refuses other kinds of credentials', async () => {
    const ctx = await setup();
    const { credential } = await connectAdPlatform({ organizationId: ctx.orgId, provider: 'tiktok_ads', fields: TIKTOK_FIELDS, actorId: ctx.owner.id, kms, fetchImpl: tiktok() });
    const later = new Date('2026-10-15T08:00:00.000Z');
    const rechecked = await checkAdPlatformConnection({ organizationId: ctx.orgId, credentialId: credential!.id, actorId: ctx.owner.id, kms, fetchImpl: tiktok('STATUS_DISABLE'), now: later });
    expect(rechecked.check).toMatchObject({ status: 'failed', reason: 'account_disabled' });
    expect(rechecked.credential).toMatchObject({ last_check_status: 'account_disabled', last_checked_on: later.toISOString() });

    const stripe = await createSharedCredential({ organizationId: ctx.orgId, name: 'Stripe', provider: 'stripe', availableScopes: ['account'], createdByUserId: ctx.owner.id });
    await expect(checkAdPlatformConnection({ organizationId: ctx.orgId, credentialId: stripe.id, actorId: ctx.owner.id, kms })).rejects.toBeInstanceOf(NotAnAdPlatformCredentialError);
    // A connection without saved details is reported as such, without calling anyone.
    const empty = await createSharedCredential({ organizationId: ctx.orgId, name: 'Google', provider: 'google_ads', availableScopes: ['1'], createdByUserId: ctx.owner.id });
    expect((await checkAdPlatformConnection({ organizationId: ctx.orgId, credentialId: empty.id, actorId: ctx.owner.id, kms })).check).toEqual({ status: 'failed', reason: 'invalid_details' });
  });
});
