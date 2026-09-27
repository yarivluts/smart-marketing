import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AdStudioBriefInput } from '@growthos/shared';
import {
  AdStudioClipNotFoundError,
  AdStudioVideoNotFoundError,
  acquireAdStudioClipLease,
  createAdStudioBrief,
  createAdStudioClip,
  createAdStudioVideo,
  createOrganizationWithOwner,
  createProject,
  deleteAdStudioBrief,
  ensureUserForFirebaseSession,
  getAdStudioClip,
  getAdStudioVideo,
  listAdStudioClips,
  listAdStudioVideos,
  markAdStudioClipFailed,
  markAdStudioClipReady,
  markAdStudioVideoFailed,
  markAdStudioVideoReady,
  recordAdStudioClipProgress,
  releaseAdStudioClipLease,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-video-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const INPUT: AdStudioBriefInput = {
  name: 'Sign in 30 seconds',
  objective: 'Trial signups',
  productDescription: 'E-signatures for lawyers',
  landingPageUrl: null,
  format: 'vertical',
  language: 'en',
  targetSeconds: 30,
};

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Video Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const brief = await createAdStudioBrief({ organizationId: organization.id, projectId: project.id, input: INPUT, createdByUserId: owner.id });
  return { owner, orgId: organization.id, projectId: project.id, briefId: brief.id };
}

function clipParams(ctx: Awaited<ReturnType<typeof setup>>, sceneId: string, requestedOn: string) {
  return {
    organizationId: ctx.orgId,
    projectId: ctx.projectId,
    briefId: ctx.briefId,
    sceneId,
    sceneFingerprint: 'fp-1',
    kind: 'render' as const,
    prompt: 'A desk',
    model: 'gemini-omni-1.1-flash',
    aspectRatio: '9:16',
    durationSeconds: 5,
    requestedBy: ctx.owner.id,
    now: new Date(requestedOn),
  };
}

describe('Ad Studio clips', () => {
  it('numbers versions per scene, lists oldest first, and never uses the ORM-stamped field names', async () => {
    const ctx = await setup();
    const first = await createAdStudioClip(clipParams(ctx, 's1', '2026-09-27T10:00:00Z'));
    const other = await createAdStudioClip(clipParams(ctx, 's2', '2026-09-27T10:01:00Z'));
    const second = await createAdStudioClip({ ...clipParams(ctx, 's1', '2026-09-27T10:02:00Z'), kind: 'edit', parentClipId: first.id });
    expect([first.version, other.version, second.version]).toEqual([1, 1, 2]);
    expect(first).toMatchObject({ status: 'generating', interaction_id: null, file_name: null, gcs_path: null, lease_token: null });
    expect(second.parent_clip_id).toBe(first.id);
    expect((await listAdStudioClips(ctx.orgId, ctx.projectId, ctx.briefId)).map((clip) => clip.id)).toEqual([first.id, other.id, second.id]);
    expect(first.getData()).not.toHaveProperty('created_on');
  });

  it('records progress, marks ready idempotently, and a finished clip never changes state again', async () => {
    const ctx = await setup();
    const clip = await createAdStudioClip(clipParams(ctx, 's1', '2026-09-27T10:00:00Z'));
    await recordAdStudioClipProgress(clip, { interactionId: 'v1_abc', fileName: 'files/xyz' });
    expect(await getAdStudioClip(ctx.orgId, ctx.projectId, ctx.briefId, clip.id)).toMatchObject({ interaction_id: 'v1_abc', file_name: 'files/xyz' });

    const ready = await markAdStudioClipReady(clip, { gcsPath: 'orgs/o/clips/c.mp4', now: new Date('2026-09-27T10:03:00Z') });
    expect(ready).toMatchObject({ status: 'ready', gcs_path: 'orgs/o/clips/c.mp4', completed_on: '2026-09-27T10:03:00.000Z' });
    expect((await markAdStudioClipReady(clip, { gcsPath: 'other.mp4' })).gcs_path).toBe('orgs/o/clips/c.mp4');
    expect((await markAdStudioClipFailed(clip, 'provider_error')).status).toBe('ready');
    expect((await recordAdStudioClipProgress(clip, { fileName: 'files/changed' })).file_name).toBe('files/xyz');

    const failing = await createAdStudioClip(clipParams(ctx, 's2', '2026-09-27T10:05:00Z'));
    expect(await markAdStudioClipFailed(failing, 'provider_billing')).toMatchObject({ status: 'failed', failure_reason: 'provider_billing' });
    expect((await markAdStudioClipReady(failing, { gcsPath: 'x.mp4' })).status).toBe('failed');
  });

  it('gives the lease to one caller at a time, lets it expire, and releases only for the holder', async () => {
    const ctx = await setup();
    const clip = await createAdStudioClip(clipParams(ctx, 's1', '2026-09-27T10:00:00Z'));
    const now = new Date('2026-09-27T10:00:10Z');
    const token = await acquireAdStudioClipLease(clip, { ttlMs: 30_000, now });
    expect(token).toEqual(expect.any(String));
    expect(await acquireAdStudioClipLease(clip, { ttlMs: 30_000, now: new Date('2026-09-27T10:00:20Z') })).toBeNull();
    const later = await acquireAdStudioClipLease(clip, { ttlMs: 30_000, now: new Date('2026-09-27T10:00:41Z') });
    expect(later).toEqual(expect.any(String));
    await releaseAdStudioClipLease(clip, token as string);
    expect((await getAdStudioClip(ctx.orgId, ctx.projectId, ctx.briefId, clip.id)).lease_token).toBe(later);
    await releaseAdStudioClipLease(clip, later as string);
    expect((await getAdStudioClip(ctx.orgId, ctx.projectId, ctx.briefId, clip.id)).lease_token).toBeNull();

    await markAdStudioClipReady(clip, { gcsPath: 'x.mp4' });
    expect(await acquireAdStudioClipLease(clip, { ttlMs: 30_000 })).toBeNull();
  });

  it('does not find a clip through another brief', async () => {
    const ctx = await setup();
    const clip = await createAdStudioClip(clipParams(ctx, 's1', '2026-09-27T10:00:00Z'));
    await expect(getAdStudioClip(ctx.orgId, ctx.projectId, 'another-brief', clip.id)).rejects.toBeInstanceOf(AdStudioClipNotFoundError);
  });
});

describe('Ad Studio assembled videos', () => {
  it('creates an assembling video, lists newest first, and finishes it once', async () => {
    const ctx = await setup();
    const base = { organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, clipIds: ['c1', 'c2'], sceneIds: ['s1', 's2'], aspectRatio: '9:16', durationSeconds: 12, requestedBy: ctx.owner.id };
    const older = await createAdStudioVideo({ ...base, now: new Date('2026-09-27T10:00:00Z') });
    const newer = await createAdStudioVideo({ ...base, now: new Date('2026-09-27T11:00:00Z') });
    expect(older).toMatchObject({ status: 'assembling', clip_ids: ['c1', 'c2'], gcs_path: null });
    expect((await listAdStudioVideos(ctx.orgId, ctx.projectId, ctx.briefId)).map((video) => video.id)).toEqual([newer.id, older.id]);

    const ready = await markAdStudioVideoReady(newer, { gcsPath: 'v.mp4', durationSeconds: 11.96, now: new Date('2026-09-27T11:01:00Z') });
    expect(ready).toMatchObject({ status: 'ready', duration_seconds: 11.96, assembled_on: '2026-09-27T11:01:00.000Z' });
    expect((await markAdStudioVideoFailed(newer, 'ffmpeg_failed')).status).toBe('ready');
    expect(await markAdStudioVideoFailed(older, 'ffmpeg_failed')).toMatchObject({ status: 'failed', failure_reason: 'ffmpeg_failed' });
    await expect(getAdStudioVideo(ctx.orgId, ctx.projectId, 'other', newer.id)).rejects.toBeInstanceOf(AdStudioVideoNotFoundError);
  });

  it('deleting a brief removes its clips and videos', async () => {
    const ctx = await setup();
    await createAdStudioClip(clipParams(ctx, 's1', '2026-09-27T10:00:00Z'));
    await createAdStudioVideo({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, clipIds: [], sceneIds: [], aspectRatio: '9:16', durationSeconds: 0, requestedBy: ctx.owner.id });
    await deleteAdStudioBrief({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, actorId: ctx.owner.id });
    expect(await listAdStudioClips(ctx.orgId, ctx.projectId, ctx.briefId)).toEqual([]);
    expect(await listAdStudioVideos(ctx.orgId, ctx.projectId, ctx.briefId)).toEqual([]);
  });
});
