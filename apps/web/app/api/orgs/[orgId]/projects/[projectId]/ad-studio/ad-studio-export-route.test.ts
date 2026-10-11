// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  AdStudioVideoModel,
  acceptInvite,
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  listAdStudioExports,
  pushResourceAttachment,
  setResourceAttachmentWriteTier,
  setSharedCredentialSecret,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider } from '@/lib/vault/kms-provider';
import { POST as exportVideo } from './briefs/[briefId]/export/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

const MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-studio-export-'));
const VIDEO_BYTES = Buffer.from('fake-mp4-bytes');

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({ currentKeyId: 'v1', keys: { v1: randomBytes(32).toString('base64') } });
  process.env.AD_STUDIO_TEST_MEDIA_DIR = MEDIA_DIR;
  await ensureFirestoreOrm();
});

beforeEach(() => getServerSessionMock.mockReset());
afterEach(() => vi.unstubAllGlobals());

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function sessionFor(email: string): Promise<DecodedIdToken> {
  const uid = unique('uid');
  await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  return { uid, email } as DecodedIdToken;
}

async function setup(options: { withMeta: boolean }) {
  const ownerSession = await sessionFor(`${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: 'Export Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const orgId = organization.id;
  const projectId = project.id;
  if (options.withMeta) {
    const credential = await createSharedCredential({ organizationId: orgId, name: 'EasySign Meta', provider: 'meta_ads', availableScopes: ['upload'], createdByUserId: owner.id });
    await setSharedCredentialSecret({
      organizationId: orgId,
      credentialId: credential.id,
      secret: JSON.stringify({ accessToken: 'meta-token', adAccountId: '58689695', pageId: '1' }),
      kms: getServerKmsProvider(),
      actorId: owner.id,
    });
    const attachment = await pushResourceAttachment({ organizationId: orgId, projectId, resourceKind: 'credential', resourceId: credential.id, pushedByUserId: owner.id, scopeSelection: ['upload'] });
    await setResourceAttachmentWriteTier({ organizationId: orgId, attachmentId: attachment.id, tier: 'optimize', actorId: owner.id });
  }
  const brief = await createAdStudioBrief({
    organizationId: orgId,
    projectId,
    input: { name: 'Sign in 30 seconds', objective: 'Signups', productDescription: 'E-signatures', landingPageUrl: null, format: 'vertical', language: 'en', targetSeconds: 10 },
    createdByUserId: owner.id,
  });
  const gcsPath = `orgs/${orgId}/projects/${projectId}/briefs/${brief.id}/videos/v1.mp4`;
  fs.mkdirSync(path.dirname(path.join(MEDIA_DIR, gcsPath)), { recursive: true });
  fs.writeFileSync(path.join(MEDIA_DIR, gcsPath), VIDEO_BYTES);
  const video = new AdStudioVideoModel();
  Object.assign(video, {
    organization_id: orgId,
    project_id: projectId,
    brief_id: brief.id,
    clip_ids: ['c1'],
    scene_ids: ['s1'],
    aspect_ratio: '9:16',
    status: 'ready',
    duration_seconds: 10,
    gcs_path: gcsPath,
    requested_by: owner.id,
    requested_on: '2026-09-28T08:00:00.000Z',
    assembled_on: '2026-09-28T08:00:05.000Z',
  });
  video.setPathParams({ organization_id: orgId, project_id: projectId });
  await video.save();
  return { owner, ownerSession, orgId, projectId, briefId: brief.id, videoId: video.id };
}

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

describe('POST .../ad-studio/briefs/[briefId]/export', () => {
  it('reads the assembled video from storage, uploads it to the Meta ad account with the saved token, and records the export', async () => {
    const ctx = await setup({ withMeta: true });
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'meta-video-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await exportVideo(request({ videoId: ctx.videoId, destination: 'meta', title: 'Sign in 30 seconds', description: 'For lawyers' }), {
      params: Promise.resolve({ orgId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ export: { destination: 'meta', status: 'done', externalUrl: 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=58689695' } });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph-video.facebook.com/v25.0/act_58689695/advideos');
    const form = init.body as FormData;
    expect(form.get('access_token')).toBe('meta-token');
    expect(Buffer.from(await (form.get('source') as File).arrayBuffer()).toString()).toBe('fake-mp4-bytes');
    expect((await listAdStudioExports(ctx.orgId, ctx.projectId, ctx.briefId))[0]).toMatchObject({ status: 'done', external_id: 'meta-video-1' });
  });

  it('refuses a destination the project has not connected, and a video that is not ready', async () => {
    const ctx = await setup({ withMeta: false });
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const params = { params: Promise.resolve({ orgId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId }) };
    const unavailable = await exportVideo(request({ videoId: ctx.videoId, destination: 'youtube', title: 'Ad' }), params);
    expect(unavailable.status).toBe(409);
    expect(await unavailable.json()).toEqual({ error: 'export_unavailable', reason: 'not_attached' });

    const missing = await exportVideo(request({ videoId: 'no-such-video', destination: 'meta', title: 'Ad' }), params);
    expect(missing.status).toBe(404);
    const bad = await exportVideo(request({ videoId: ctx.videoId, destination: 'tiktok', title: 'Ad' }), params);
    expect(bad.status).toBe(400);
  });

  it('needs automation.execute: an editor (who can use the studio) cannot export', async () => {
    const ctx = await setup({ withMeta: true });
    const email = `${unique('editor')}@example.com`;
    const invitation = await inviteMemberToOrganization({ organizationId: ctx.orgId, email, role: 'editor', invitedByUserId: ctx.owner.id, projectId: ctx.projectId });
    const editorSession = await sessionFor(email);
    const editor = await ensureUserForFirebaseSession({ firebaseUid: editorSession.uid, email });
    await acceptInvite({ organizationId: ctx.orgId, membershipId: invitation.id, userId: editor.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue(editorSession);
    const response = await exportVideo(request({ videoId: ctx.videoId, destination: 'meta', title: 'Ad' }), {
      params: Promise.resolve({ orgId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId }),
    });
    expect([403, 404]).toContain(response.status);
  });
});
