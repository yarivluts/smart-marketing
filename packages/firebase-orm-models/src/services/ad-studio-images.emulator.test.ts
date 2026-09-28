import 'reflect-metadata';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  acquireAdStudioRunLease,
  AdStudioImageConceptsInvalidError,
  AdStudioImageNotReadyError,
  AdStudioQuotaExceededError,
  AdStudioRunAlreadyActiveError,
  AdStudioRunOptionsInvalidError,
  AD_STUDIO_DEFAULT_DAILY_IMAGES,
  assertAdStudioQuota,
  cancelAdStudioRun,
  createAdStudioBrief,
  createAdStudioImage,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  deleteAdStudioBrief,
  ensureUserForFirebaseSession,
  exportAdStudioImage,
  generateLocalKmsKeyRing,
  getAdStudioBrief,
  getAdStudioSettings,
  getAdStudioUsageToday,
  getLatestAdStudioRun,
  listAdStudioExports,
  listAdStudioImages,
  listAdStudioRuns,
  LocalKmsProvider,
  markAdStudioImageFailed,
  markAdStudioImageReady,
  pushResourceAttachment,
  recordAdStudioUsage,
  saveAdStudioImageConcepts,
  saveAdStudioRunProgress,
  selectAdStudioImage,
  setAdStudioSettings,
  setResourceAttachmentWriteTier,
  setSharedCredentialSecret,
  startAdStudioRun,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-images-tests');
});

const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
const kms = new LocalKmsProvider(keyRing, currentKeyId);

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const INPUT = {
  name: 'Sign in 30 seconds',
  objective: 'Trial signups from small law firms',
  productDescription: 'E-signatures for lawyers',
  landingPageUrl: null,
  format: 'vertical' as const,
  language: 'en',
  targetSeconds: 20,
};

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Images Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const brief = await createAdStudioBrief({ organizationId: organization.id, projectId: project.id, input: INPUT, createdByUserId: owner.id });
  return { owner, orgId: organization.id, projectId: project.id, briefId: brief.id };
}

const CONCEPT = { id: 'c1', visualPrompt: 'A lawyer signing on a phone', headline: 'Sign in 30 seconds', formats: ['square' as const, 'story' as const] };

async function newImage(ctx: Awaited<ReturnType<typeof setup>>, overrides: Partial<Parameters<typeof createAdStudioImage>[0]> = {}) {
  return createAdStudioImage({
    organizationId: ctx.orgId,
    projectId: ctx.projectId,
    briefId: ctx.briefId,
    conceptId: 'c1',
    format: 'square',
    kind: 'render',
    conceptFingerprint: 'fp',
    prompt: 'prompt',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image',
    actorId: ctx.owner.id,
    ...overrides,
  });
}

describe('image concepts on a brief', () => {
  it('saves valid concepts and refuses a list that breaks the rules', async () => {
    const ctx = await setup();
    const brief = await saveAdStudioImageConcepts({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, concepts: [CONCEPT] });
    expect(brief.image_concepts).toEqual([CONCEPT]);
    await expect(
      saveAdStudioImageConcepts({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, concepts: [{ ...CONCEPT, visualPrompt: ' ', formats: [] }] }),
    ).rejects.toBeInstanceOf(AdStudioImageConceptsInvalidError);
    expect((await getAdStudioBrief(ctx.orgId, ctx.projectId, ctx.briefId)).image_concepts).toEqual([CONCEPT]);
  });
});

describe('image records', () => {
  it('numbers versions per concept and placement, selects the newest ready image, and lets a person pick an older one', async () => {
    const ctx = await setup();
    const first = await newImage(ctx);
    expect(first).toMatchObject({ version: 1, status: 'generating', selected: false });
    await markAdStudioImageReady(first, { gcsPath: 'p/1.png', mimeType: 'image/png', byteSize: 10 });
    const second = await newImage(ctx, { kind: 'edit', parentImageId: first.id, instruction: 'warmer light' });
    expect(second.version).toBe(2);
    await markAdStudioImageReady(second, { gcsPath: 'p/2.png', mimeType: 'image/png', byteSize: 12 });
    const otherFormat = await newImage(ctx, { format: 'story' });
    expect(otherFormat.version).toBe(1);

    let images = await listAdStudioImages(ctx.orgId, ctx.projectId, ctx.briefId);
    expect(images.filter((image) => image.image_format === 'square' && image.selected).map((image) => image.id)).toEqual([second.id]);

    await selectAdStudioImage(ctx.orgId, ctx.projectId, ctx.briefId, first.id);
    images = await listAdStudioImages(ctx.orgId, ctx.projectId, ctx.briefId);
    expect(images.filter((image) => image.image_format === 'square' && image.selected).map((image) => image.id)).toEqual([first.id]);

    const failed = await newImage(ctx);
    await markAdStudioImageFailed(failed, { code: 'refused', message: 'blocked' });
    await expect(selectAdStudioImage(ctx.orgId, ctx.projectId, ctx.briefId, failed.id)).rejects.toBeInstanceOf(AdStudioImageNotReadyError);
  });

  it('are removed with the brief, together with its runs', async () => {
    const ctx = await setup();
    await newImage(ctx);
    await startAdStudioRun({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, options: {}, actorId: ctx.owner.id });
    await deleteAdStudioBrief({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, actorId: ctx.owner.id });
    expect(await listAdStudioImages(ctx.orgId, ctx.projectId, ctx.briefId)).toEqual([]);
    expect(await listAdStudioRuns(ctx.orgId, ctx.projectId, ctx.briefId)).toEqual([]);
  });
});

describe('the daily image limit', () => {
  it('counts image renders and edits apart from text and video, and refuses past the limit', async () => {
    const ctx = await setup();
    expect((await getAdStudioSettings(ctx.orgId, ctx.projectId)).dailyImages).toBe(AD_STUDIO_DEFAULT_DAILY_IMAGES);
    const saved = await setAdStudioSettings({ organizationId: ctx.orgId, projectId: ctx.projectId, dailyTextGenerations: 50, dailyVideoSeconds: 300, dailyImages: 2, actorId: ctx.owner.id });
    expect(saved.dailyImages).toBe(2);
    // An older caller that does not know about images keeps the image limit.
    expect((await setAdStudioSettings({ organizationId: ctx.orgId, projectId: ctx.projectId, dailyTextGenerations: 40, dailyVideoSeconds: 300, actorId: ctx.owner.id })).dailyImages).toBe(2);

    for (const kind of ['image', 'image_edit', 'script'] as const) {
      await recordAdStudioUsage({ organizationId: ctx.orgId, projectId: ctx.projectId, kind, provider: 'gemini', model: 'm', units: 1, actorId: ctx.owner.id, outcome: 'succeeded' });
    }
    expect(await getAdStudioUsageToday(ctx.orgId, ctx.projectId)).toMatchObject({ images: 2, textGenerations: 1, videoSeconds: 0 });
    await expect(assertAdStudioQuota({ organizationId: ctx.orgId, projectId: ctx.projectId, kind: 'image', units: 1 })).rejects.toMatchObject({ limitKind: 'image', used: 2, limit: 2 });
    await expect(assertAdStudioQuota({ organizationId: ctx.orgId, projectId: ctx.projectId, kind: 'image', units: 1 })).rejects.toBeInstanceOf(AdStudioQuotaExceededError);
    await expect(assertAdStudioQuota({ organizationId: ctx.orgId, projectId: ctx.projectId, kind: 'script', units: 1 })).resolves.toBeUndefined();
  });
});

describe('autopilot runs', () => {
  it('starts with every step pending, allows one active run per brief, and leases it to one caller at a time', async () => {
    const ctx = await setup();
    const run = await startAdStudioRun({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, options: { imageFormats: ['story'] }, actorId: ctx.owner.id });
    expect(run.options).toEqual({ plan: true, images: true, imageFormats: ['story'], video: true, environmentId: null });
    expect(run.steps.map((step) => [step.id, step.status])).toEqual([
      ['plan', 'pending'],
      ['script', 'pending'],
      ['image_concepts', 'pending'],
      ['images', 'pending'],
      ['clips', 'pending'],
      ['assemble', 'pending'],
    ]);
    await expect(startAdStudioRun({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, options: {}, actorId: ctx.owner.id })).rejects.toBeInstanceOf(
      AdStudioRunAlreadyActiveError,
    );

    const token = await acquireAdStudioRunLease(run, { ttlMs: 60_000 });
    expect(token).toBeTruthy();
    expect(await acquireAdStudioRunLease(run, { ttlMs: 60_000 })).toBeNull();
    run.steps[0].status = 'skipped';
    await saveAdStudioRunProgress(run, token as string);
    expect(await acquireAdStudioRunLease(run, { ttlMs: 60_000 })).toBeTruthy();

    const cancelled = await cancelAdStudioRun({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, runId: run.id, actorId: ctx.owner.id });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.steps.filter((step) => step.status === 'pending')).toEqual([]);
    expect((await getLatestAdStudioRun(ctx.orgId, ctx.projectId, ctx.briefId))?.id).toBe(run.id);
    // Once cancelled, a new run may start.
    await expect(startAdStudioRun({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, options: {}, actorId: ctx.owner.id })).resolves.toBeTruthy();
  });

  it('refuses options that ask for nothing or name an unknown image format', async () => {
    const ctx = await setup();
    await expect(startAdStudioRun({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, options: { images: false, video: false }, actorId: ctx.owner.id })).rejects.toBeInstanceOf(
      AdStudioRunOptionsInvalidError,
    );
    await expect(
      startAdStudioRun({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, options: { imageFormats: ['banner' as never] }, actorId: ctx.owner.id }),
    ).rejects.toBeInstanceOf(AdStudioRunOptionsInvalidError);
  });

  it('closes an abandoned run so a new one can start', async () => {
    const ctx = await setup();
    const old = await startAdStudioRun({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, options: {}, actorId: ctx.owner.id, now: new Date(Date.now() - 2 * 3600_000) });
    const fresh = await startAdStudioRun({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, options: {}, actorId: ctx.owner.id });
    const runs = await listAdStudioRuns(ctx.orgId, ctx.projectId, ctx.briefId);
    expect(runs.find((run) => run.id === old.id)).toMatchObject({ status: 'cancelled', failure_code: 'abandoned' });
    expect(fresh.status).toBe('running');
  });
});

describe('exportAdStudioImage', () => {
  async function attach(ctx: Awaited<ReturnType<typeof setup>>, provider: 'meta_ads' | 'google_ads', secret: string) {
    const credential = await createSharedCredential({ organizationId: ctx.orgId, name: `${provider} login`, provider, availableScopes: ['upload'], createdByUserId: ctx.owner.id });
    await setSharedCredentialSecret({ organizationId: ctx.orgId, credentialId: credential.id, secret, kms, actorId: ctx.owner.id });
    const attachment = await pushResourceAttachment({ organizationId: ctx.orgId, projectId: ctx.projectId, resourceKind: 'credential', resourceId: credential.id, pushedByUserId: ctx.owner.id, scopeSelection: ['upload'] });
    await setResourceAttachmentWriteTier({ organizationId: ctx.orgId, attachmentId: attachment.id, tier: 'optimize', actorId: ctx.owner.id });
  }

  it('uploads to Google Ads as an image asset with the decrypted credential and records the asset', async () => {
    const ctx = await setup();
    await attach(ctx, 'google_ads', JSON.stringify({ developerToken: 'd', clientId: 'c', clientSecret: 's', refreshToken: 'r', customerId: '123' }));
    const upload = vi.fn(async () => ({ externalId: 'customers/123/assets/9', url: null }));
    const row = await exportAdStudioImage({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: ctx.briefId,
      imageId: 'img-1',
      destination: 'google_ads',
      title: 'Sign in 30 seconds - square',
      readImage: async () => new Uint8Array([1, 2, 3]),
      kms,
      actorId: ctx.owner.id,
      uploaders: { google_ads: upload },
    });
    expect(row).toMatchObject({ status: 'done', media_kind: 'image', image_id: 'img-1', video_id: null, destination: 'google_ads', external_id: 'customers/123/assets/9' });
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sign in 30 seconds - square', bytes: new Uint8Array([1, 2, 3]) }));
    expect(JSON.parse((upload.mock.calls[0] as unknown as [{ secretJson: string }])[0].secretJson)).toMatchObject({ customerId: '123' });
    expect((await listAdStudioExports(ctx.orgId, ctx.projectId, ctx.briefId))[0].id).toBe(row.id);
  });

  it('refuses a destination that is not connected and a video-only destination', async () => {
    const ctx = await setup();
    await expect(
      exportAdStudioImage({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, imageId: 'i', destination: 'meta', title: 'x', readImage: async () => new Uint8Array(), kms, actorId: ctx.owner.id }),
    ).rejects.toMatchObject({ name: 'AdStudioExportUnavailableError', reason: 'not_attached' });
    await expect(
      exportAdStudioImage({
        organizationId: ctx.orgId,
        projectId: ctx.projectId,
        briefId: ctx.briefId,
        imageId: 'i',
        destination: 'youtube' as never,
        title: 'x',
        readImage: async () => new Uint8Array(),
        kms,
        actorId: ctx.owner.id,
      }),
    ).rejects.toMatchObject({ name: 'AdStudioExportInvalidError' });
  });
});
