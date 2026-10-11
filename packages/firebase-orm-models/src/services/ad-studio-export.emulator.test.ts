import 'reflect-metadata';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AdStudioExportInvalidError,
  AdStudioExportUnavailableError,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  ensureUserForFirebaseSession,
  exportAdStudioVideo,
  generateLocalKmsKeyRing,
  listAdStudioExports,
  listAuditLogEntriesForOrg,
  LocalKmsProvider,
  MetaVideoUploadError,
  pushResourceAttachment,
  resolveAdStudioExportDestinations,
  setResourceAttachmentWriteTier,
  setSharedCredentialSecret,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-export-tests');
});

const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
const kms = new LocalKmsProvider(keyRing, currentKeyId);
const VIDEO = new Uint8Array([0, 1, 2, 3, 4]);

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Export Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, orgId: organization.id, projectId: project.id };
}

async function attach(ctx: { owner: { id: string }; orgId: string; projectId: string }, provider: 'meta_ads' | 'youtube', secret: string | null, tier: 'read' | 'optimize' | 'manage') {
  const credential = await createSharedCredential({ organizationId: ctx.orgId, name: `${provider} login`, provider, availableScopes: ['upload'], createdByUserId: ctx.owner.id });
  if (secret) await setSharedCredentialSecret({ organizationId: ctx.orgId, credentialId: credential.id, secret, kms, actorId: ctx.owner.id });
  const attachment = await pushResourceAttachment({ organizationId: ctx.orgId, projectId: ctx.projectId, resourceKind: 'credential', resourceId: credential.id, pushedByUserId: ctx.owner.id, scopeSelection: ['upload'] });
  await setResourceAttachmentWriteTier({ organizationId: ctx.orgId, attachmentId: attachment.id, tier, actorId: ctx.owner.id });
  return { credential, attachment };
}

const META_SECRET = JSON.stringify({ accessToken: 'meta-token', adAccountId: '58689695', pageId: '123' });
const YOUTUBE_SECRET = JSON.stringify({ clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt' });

describe('resolveAdStudioExportDestinations', () => {
  it('reports each destination as available only through an approved, writable attachment with a secret, and says why not otherwise', async () => {
    const ctx = await setup();
    expect(await resolveAdStudioExportDestinations(ctx.orgId, ctx.projectId)).toEqual({
      meta: { available: false, reason: 'not_attached' },
      youtube: { available: false, reason: 'not_attached' },
      google_ads: { available: false, reason: 'not_attached' },
    });
    await attach(ctx, 'youtube', null, 'manage');
    await attach(ctx, 'meta_ads', META_SECRET, 'read');
    const partial = await resolveAdStudioExportDestinations(ctx.orgId, ctx.projectId);
    expect(partial.youtube).toMatchObject({ available: false, reason: 'no_secret' });
    expect(partial.meta).toMatchObject({ available: false, reason: 'read_only' });

    await attach(ctx, 'meta_ads', META_SECRET, 'optimize');
    expect((await resolveAdStudioExportDestinations(ctx.orgId, ctx.projectId)).meta).toMatchObject({ available: true, credentialName: 'meta_ads login' });
  });
});

describe('exportAdStudioVideo', () => {
  it('uploads to Meta with the decrypted account, records done with the id and link, and audits it', async () => {
    const ctx = await setup();
    await attach(ctx, 'meta_ads', META_SECRET, 'optimize');
    const meta = vi.fn(async () => ({ videoId: 'mv1', url: 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=58689695' }));
    const row = await exportAdStudioVideo({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: 'brief-1',
      videoId: 'video-1',
      destination: 'meta',
      title: ' Sign in 30 seconds ',
      description: 'For lawyers',
      readVideo: async () => VIDEO,
      kms,
      actorId: ctx.owner.id,
      uploaders: { meta },
    });
    expect(meta).toHaveBeenCalledWith({ accessToken: 'meta-token', adAccountId: '58689695', title: 'Sign in 30 seconds', description: 'For lawyers', bytes: VIDEO });
    expect(row).toMatchObject({ status: 'done', external_id: 'mv1', destination: 'meta', privacy: null });
    expect((await listAdStudioExports(ctx.orgId, ctx.projectId, 'brief-1')).map((entry) => entry.id)).toEqual([row.id]);
    const audit = await listAuditLogEntriesForOrg(ctx.orgId);
    expect(audit.find((entry) => entry.action === 'ad_studio.video_exported')).toMatchObject({ target_id: row.id });
  });

  it('uploads to YouTube as unlisted by default, and records a platform failure with its code', async () => {
    const ctx = await setup();
    await attach(ctx, 'youtube', YOUTUBE_SECRET, 'manage');
    await attach(ctx, 'meta_ads', META_SECRET, 'manage');
    const youtube = vi.fn(async () => ({ videoId: 'yt1', url: 'https://www.youtube.com/watch?v=yt1' }));
    const base = { organizationId: ctx.orgId, projectId: ctx.projectId, briefId: 'brief-2', videoId: 'video-2', title: 'Ad', description: '', readVideo: async () => VIDEO, kms, actorId: ctx.owner.id };
    const done = await exportAdStudioVideo({ ...base, destination: 'youtube', uploaders: { youtube } });
    expect(youtube).toHaveBeenCalledWith({ clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt' }, { title: 'Ad', description: '', privacyStatus: 'unlisted', bytes: VIDEO });
    expect(done).toMatchObject({ status: 'done', privacy: 'unlisted', external_url: 'https://www.youtube.com/watch?v=yt1' });

    const failed = await exportAdStudioVideo({
      ...base,
      destination: 'meta',
      uploaders: {
        meta: async () => {
          throw new MetaVideoUploadError('auth_failed', 'Error validating access token');
        },
      },
    });
    expect(failed).toMatchObject({ status: 'failed', failure_code: 'auth_failed', failure_message: 'Error validating access token' });
    expect((await listAuditLogEntriesForOrg(ctx.orgId)).some((entry) => entry.action === 'ad_studio.video_export_failed')).toBe(true);
  });

  it('refuses an invalid request or an unavailable destination before recording anything', async () => {
    const ctx = await setup();
    const base = { organizationId: ctx.orgId, projectId: ctx.projectId, briefId: 'brief-3', videoId: 'v', description: '', readVideo: async () => VIDEO, kms, actorId: ctx.owner.id };
    await expect(exportAdStudioVideo({ ...base, destination: 'youtube', title: '  ' })).rejects.toBeInstanceOf(AdStudioExportInvalidError);
    await expect(exportAdStudioVideo({ ...base, destination: 'youtube', title: 'Ad', privacy: 'secret' as never })).rejects.toBeInstanceOf(AdStudioExportInvalidError);
    await expect(exportAdStudioVideo({ ...base, destination: 'meta', title: 'Ad' })).rejects.toMatchObject({ reason: 'not_attached' });
    await expect(exportAdStudioVideo({ ...base, destination: 'meta', title: 'Ad' })).rejects.toBeInstanceOf(AdStudioExportUnavailableError);
    expect(await listAdStudioExports(ctx.orgId, ctx.projectId, 'brief-3')).toEqual([]);
  });
});
