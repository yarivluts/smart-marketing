// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { imageConceptFingerprint, type AdStudioImageConcept } from '@growthos/shared';
import {
  acceptInvite,
  createAdStudioBrief,
  createAdStudioImage,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  markAdStudioImageReady,
  saveAdStudioImageConcepts,
  setAdStudioBrandLogo,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { configureAdStudioRuntime, createMemoryMediaStorage } from '@/lib/ad-studio/engine';
import { loadSharedAds } from '@/lib/ad-studio/share';
import { GET as listLinks, POST as createLink } from '../../orgs/[orgId]/projects/[projectId]/ad-studio/share-links/route';
import { DELETE as revokeLink } from '../../orgs/[orgId]/projects/[projectId]/ad-studio/share-links/[linkId]/route';
import { GET as sharedImage } from './[token]/briefs/[briefId]/images/[imageId]/route';
import { GET as sharedVideo } from './[token]/briefs/[briefId]/videos/[videoId]/route';
import { GET as sharedLogo } from './[token]/logo/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

const storage = createMemoryMediaStorage();
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
  configureAdStudioRuntime({ mediaStorage: () => storage });
});

beforeEach(() => {
  getServerSessionMock.mockReset();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function sessionFor(email: string): Promise<DecodedIdToken> {
  const uid = unique('uid');
  await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  return { uid, email } as DecodedIdToken;
}

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

const CONCEPT: AdStudioImageConcept = { id: 'c1', visualPrompt: 'A clinic at dawn', headline: 'Book today', formats: ['square'], copy: { headline: 'Book today', primaryText: 'Spring is here', description: '' } };

/** A project with one ad whose idea has two ready square images; the newer one is the chosen one. */
async function setup() {
  const ownerSession = await sessionFor(`${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: 'Share Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const orgId = organization.id;
  const projectId = project.id;
  const brief = await createAdStudioBrief({
    organizationId: orgId,
    projectId,
    input: { name: 'Spring sale', objective: 'Bookings', productDescription: 'A clinic', landingPageUrl: 'https://acme.example', format: 'vertical', language: 'en', targetSeconds: 15 },
    createdByUserId: owner.id,
  });
  await saveAdStudioImageConcepts({ organizationId: orgId, projectId, briefId: brief.id, concepts: [CONCEPT] });
  const render = async (n: number) => {
    const image = await createAdStudioImage({ organizationId: orgId, projectId, briefId: brief.id, conceptId: 'c1', format: 'square', kind: 'render', conceptFingerprint: imageConceptFingerprint(CONCEPT, 'square', 'en'), prompt: 'p', provider: 'test', model: 'm', actorId: owner.id });
    const gcsPath = `test/${orgId}/${brief.id}/${image.id}-${n}.png`;
    await storage.upload(gcsPath, PNG, 'image/png');
    return markAdStudioImageReady(image, { gcsPath, mimeType: 'image/png', byteSize: PNG.length });
  };
  const older = await render(1);
  const chosen = await render(2);
  const other = await createAdStudioBrief({
    organizationId: orgId,
    projectId,
    input: { name: 'Other ad', objective: 'x', productDescription: 'y', landingPageUrl: '', format: 'vertical', language: 'en', targetSeconds: 15 },
    createdByUserId: owner.id,
  });
  getServerSessionMock.mockResolvedValue(ownerSession);
  return { ownerSession, owner, orgId, projectId, briefId: brief.id, otherBriefId: other.id, olderId: older.id, chosenId: chosen.id };
}

type Ctx = Awaited<ReturnType<typeof setup>>;
const projectParams = (ctx: Ctx) => ({ params: Promise.resolve({ orgId: ctx.orgId, projectId: ctx.projectId }) });
const image = (token: string, briefId: string, imageId: string) => sharedImage(request('GET'), { params: Promise.resolve({ token, briefId, imageId }) });

async function makeLink(ctx: Ctx, body: unknown): Promise<{ token: string; link: { id: string } }> {
  const response = await createLink(request('POST', body), projectParams(ctx));
  expect(response.status).toBe(201);
  return (await response.json()) as { token: string; link: { id: string } };
}

describe('ad share links (routes)', () => {
  it('a project admin makes, lists and revokes a link; the token is only in the create response', async () => {
    const ctx = await setup();
    const { token, link } = await makeLink(ctx, { briefIds: [ctx.briefId], label: 'Dana', expiresInDays: 7 });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const listed = await listLinks(request('GET'), projectParams(ctx));
    const body = await listed.text();
    expect(body).not.toContain(token);
    expect(JSON.parse(body).links).toMatchObject([{ id: link.id, label: 'Dana', briefIds: [ctx.briefId], status: 'active' }]);

    const revoked = await revokeLink(request('DELETE'), { params: Promise.resolve({ orgId: ctx.orgId, projectId: ctx.projectId, linkId: link.id }) });
    expect(revoked.status).toBe(200);
    expect(((await revoked.json()) as { link: { status: string } }).link.status).toBe('revoked');
    expect((await image(token, ctx.briefId, ctx.chosenId)).status).toBe(404);
    expect(await loadSharedAds(token)).toBeNull();
  });

  it('refuses a viewer, bad input and an ad of another project', async () => {
    const ctx = await setup();
    const elsewhere = await setup();
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    expect((await createLink(request('POST', { expiresInDays: 365 }), projectParams(ctx))).status).toBe(400);
    expect((await createLink(request('POST', { briefIds: 'all' }), projectParams(ctx))).status).toBe(400);
    expect((await createLink(request('POST', { briefIds: [elsewhere.briefId] }), projectParams(ctx))).status).toBe(404);

    const email = `${unique('viewer')}@example.com`;
    const invitation = await inviteMemberToOrganization({ organizationId: ctx.orgId, email, role: 'viewer', invitedByUserId: ctx.owner.id });
    const viewerSession = await sessionFor(email);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email });
    await acceptInvite({ organizationId: ctx.orgId, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue(viewerSession);
    expect([403, 404]).toContain((await createLink(request('POST', {}), projectParams(ctx))).status);
    expect([403, 404]).toContain((await listLinks(request('GET'), projectParams(ctx))).status);
    getServerSessionMock.mockResolvedValue(null);
    expect([401, 403, 404]).toContain((await createLink(request('POST', {}), projectParams(ctx))).status);
  });

  it('serves only the chosen image of a shared ad, without signing in, and nothing of another project', async () => {
    const ctx = await setup();
    const elsewhere = await setup();
    const { token } = await makeLink(ctx, { briefIds: [ctx.briefId] });
    getServerSessionMock.mockResolvedValue(null);

    const served = await image(token, ctx.briefId, ctx.chosenId);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('cache-control')).toBe('private, max-age=300');
    expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG);

    // An older version that is not chosen, an ad outside the link, another project's image, junk ids.
    expect((await image(token, ctx.briefId, ctx.olderId)).status).toBe(404);
    expect((await image(token, ctx.otherBriefId, ctx.chosenId)).status).toBe(404);
    expect((await image(token, elsewhere.briefId, elsewhere.chosenId)).status).toBe(404);
    expect((await image(token, ctx.briefId, '..')).status).toBe(404);
    expect((await image('A'.repeat(43), ctx.briefId, ctx.chosenId)).status).toBe(404);
    expect((await sharedVideo(request('GET'), { params: Promise.resolve({ token, briefId: ctx.briefId, videoId: 'nope' }) })).status).toBe(404);

    // The other project's token opens only its own ad.
    getServerSessionMock.mockResolvedValue(elsewhere.ownerSession);
    const { token: otherToken } = await makeLink(elsewhere, { briefIds: null });
    expect((await image(otherToken, ctx.briefId, ctx.chosenId)).status).toBe(404);
    expect((await image(otherToken, elsewhere.briefId, elsewhere.chosenId)).status).toBe(200);
  });

  it('gathers the shared ads for the public page: brand, logo and the chosen images with their copy', async () => {
    const ctx = await setup();
    const logoPath = `test/${ctx.orgId}/logo.png`;
    await storage.upload(logoPath, PNG, 'image/png');
    await setAdStudioBrandLogo({ organizationId: ctx.orgId, projectId: ctx.projectId, logo: { path: logoPath, mimeType: 'image/png' }, actorId: ctx.owner.id });
    const { token } = await makeLink(ctx, { briefIds: null });

    const page = await loadSharedAds(token);
    expect(page?.logoSrc).toContain(`/api/share/ads/${token}/logo`);
    // The other ad has nothing finished, so only the one with an image is shown.
    expect(page?.briefs).toEqual([
      {
        id: ctx.briefId,
        name: 'Spring sale',
        language: 'en',
        landingPageUrl: 'https://acme.example',
        images: [{ conceptId: 'c1', index: 1, copy: CONCEPT.copy, byFormat: { square: `/api/share/ads/${token}/briefs/${ctx.briefId}/images/${ctx.chosenId}` } }],
        video: null,
      },
    ]);
    const logo = await sharedLogo(request('GET'), { params: Promise.resolve({ token }) });
    expect(logo.status).toBe(200);
    expect(Buffer.from(await logo.arrayBuffer())).toEqual(PNG);
    expect((await sharedLogo(request('GET'), { params: Promise.resolve({ token: 'nope' }) })).status).toBe(404);
    expect(await loadSharedAds('not-a-token')).toBeNull();
  });
});
