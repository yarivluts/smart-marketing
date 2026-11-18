// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { imageConceptFingerprint, type AdStudioImageConcept } from '@growthos/shared';
import {
  acceptInvite,
  chooseAdStudioClip,
  createAdStudioBrief,
  createAdStudioClip,
  createAdStudioImage,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  markAdStudioClipReady,
  markAdStudioImageReady,
  saveAdStudioImageConcepts,
  saveAdStudioScript,
  setAdStudioBrandLogo,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { configureAdStudioRuntime, createMemoryMediaStorage } from '@/lib/ad-studio/engine';
import { loadSharedAds } from '@/lib/ad-studio/share';
import { GET as listLinks, POST as createLink } from '../../orgs/[orgId]/projects/[projectId]/ad-studio/share-links/route';
import { DELETE as revokeLink } from '../../orgs/[orgId]/projects/[projectId]/ad-studio/share-links/[linkId]/route';
import { GET as sharedImage } from './[token]/briefs/[briefId]/images/[imageId]/route';
import { GET as sharedVideo } from './[token]/briefs/[briefId]/videos/[videoId]/route';
import { GET as sharedClip } from './[token]/briefs/[briefId]/clips/[clipId]/route';
import { GET as sharedLogo } from './[token]/logo/route';
import { GET as getPublicFeedback, POST as postPublicFeedback } from './[token]/feedback/route';
import {
  GET as getClientRequests,
  POST as postClientRequests,
} from '../../orgs/[orgId]/projects/[projectId]/ad-studio/client-requests/route';
import { POST as decideProposalRoute } from '../../orgs/[orgId]/projects/[projectId]/ad-studio/client-requests/proposals/[proposalId]/route';
import { saveAdShareProposals } from '@growthos/firebase-orm-models';

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
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
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

  it('collects client feedback, serves manager return reports & manual requests, declines proposals, and mints updated revisions', async () => {
    const ctx = await setup();
    const { token, link } = await makeLink(ctx, { briefIds: null, includeResults: true, allowFeedback: true });

    // Anonymous client approves & leaves an improvement request.
    getServerSessionMock.mockResolvedValue(null);
    const addFeedbackRes = await postPublicFeedback(
      request('POST', {
        authorName: 'Client Dana',
        targetKind: 'brief',
        briefId: ctx.briefId,
        verdict: 'changes_requested',
        comment: 'Use warmer lighting and emphasize 25-year guarantee.',
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(addFeedbackRes.status).toBe(201);
    const { item: fb } = (await addFeedbackRes.json()) as { item: { id: string } };

    // Unknown brief returns 404, scoped share link out-of-scope brief returns 400, disabled feedback returns 403.
    expect(
      (
        await postPublicFeedback(
          request('POST', {
            targetKind: 'brief',
            briefId: 'other-brief',
            verdict: 'comment',
            comment: 'Unknown brief',
          }),
          { params: Promise.resolve({ token }) },
        )
      ).status,
    ).toBe(404);

    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const { token: scopedToken } = await makeLink(ctx, { briefIds: [ctx.briefId], allowFeedback: true });
    getServerSessionMock.mockResolvedValue(null);
    expect(
      (
        await postPublicFeedback(
          request('POST', {
            targetKind: 'brief',
            briefId: 'another-brief-outside-scope',
            verdict: 'comment',
            comment: 'Out of scope brief',
          }),
          { params: Promise.resolve({ token: scopedToken }) },
        )
      ).status,
    ).toBe(400);

    const listPubRes = await getPublicFeedback(request('GET'), { params: Promise.resolve({ token }) });
    expect(listPubRes.status).toBe(200);
    const listPubBody = (await listPubRes.json()) as { feedback: { id: string }[] };
    expect(listPubBody.feedback.map((entry) => entry.id)).toContain(fb.id);

    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const { token: lockedToken } = await makeLink(ctx, { briefIds: null, allowFeedback: false });
    getServerSessionMock.mockResolvedValue(null);
    expect(
      (
        await postPublicFeedback(
          request('POST', { targetKind: 'general', verdict: 'request', comment: 'Should be blocked' }),
          { params: Promise.resolve({ token: lockedToken }) },
        )
      ).status,
    ).toBe(403);

    // Unauthenticated gets 401; invited viewer cannot read manager client-requests queue (403).
    getServerSessionMock.mockResolvedValue(null);
    expect((await getClientRequests(request('GET'), projectParams(ctx))).status).toBe(401);

    const viewerEmail = `${unique('viewer')}@example.com`;
    const viewerInvite = await inviteMemberToOrganization({ organizationId: ctx.orgId, email: viewerEmail, role: 'viewer', invitedByUserId: ctx.owner.id });
    const viewerSession = await sessionFor(viewerEmail);
    const viewerUser = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: ctx.orgId, membershipId: viewerInvite.id, userId: viewerUser.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue(viewerSession);
    expect((await getClientRequests(request('GET'), projectParams(ctx))).status).toBe(403);

    // Owner reads return report + fix-agent prompt and records a manual client request.
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const managerGet = await getClientRequests(request('GET'), projectParams(ctx));
    expect(managerGet.status).toBe(200);
    const managerBody = (await managerGet.json()) as {
      feedback: { id: string }[];
      reportMarkdown: string;
      fixAgentPrompt: string;
    };
    expect(managerBody.feedback.some((entry) => entry.id === fb.id)).toBe(true);
    expect(managerBody.reportMarkdown).toContain('Use warmer lighting and emphasize 25-year guarantee.');
    expect(managerBody.fixAgentPrompt).toContain('Use warmer lighting and emphasize 25-year guarantee.');
    expect(managerBody.fixAgentPrompt).toContain(ctx.briefId);

    const manualRes = await postClientRequests(
      request('POST', {
        action: 'add_request',
        clientLabel: 'VIP',
        targetKind: 'general',
        verdict: 'request',
        comment: 'Build an additional video ad for business customers.',
      }),
      projectParams(ctx),
    );
    expect(manualRes.status).toBe(201);

    // Seed a proposal and verify manager decline route updates Firestore cleanly without needing LLM creds.
    const [proposal] = await saveAdShareProposals({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      actorId: ctx.owner.id,
      proposals: [
        {
          feedbackIds: [fb.id],
          clientQuote: 'Use warmer lighting',
          kind: 'update_brief_settings',
          briefId: ctx.briefId,
          briefName: 'Spring sale',
          title: 'Warm daylight adjustment',
          summary: 'Adjust video direction',
          rationale: 'Direct client ask',
          changes: { videoInstructions: 'Warm golden-hour lighting' },
        },
      ],
    });
    const declineRes = await decideProposalRoute(
      request('POST', { decision: 'decline' }),
      { params: Promise.resolve({ orgId: ctx.orgId, projectId: ctx.projectId, proposalId: proposal.id }) },
    );
    expect(declineRes.status).toBe(200);
    expect(((await declineRes.json()) as { proposal: { status: string } }).proposal.status).toBe('declined');

    // Create Revision #2 link marking feedback sent to client.
    const revRes = await createLink(
      request('POST', {
        briefIds: null,
        label: 'Spring v2',
        expiresInDays: 30,
        revisionNumber: 2,
        revisionNote: 'Applied client feedback',
        supersedesLinkId: link.id,
        markFeedbackSentIds: [fb.id],
      }),
      projectParams(ctx),
    );
    expect(revRes.status).toBe(201);
    const { token: rev2Token } = (await revRes.json()) as { token: string };
    const rev2Page = await loadSharedAds(rev2Token);
    expect(rev2Page?.revisionNumber).toBe(2);
    expect(rev2Page?.revisionNote).toBe('Applied client feedback');
  });

  it('streams preferred pre-publication scene clips and loads unrendered drafts only when includeDrafts is true', async () => {
    const ctx = await setup();
    await saveAdStudioScript({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: ctx.otherBriefId,
      scenes: [{ id: 's1', durationSeconds: 5, visualPrompt: 'Office desk', voiceover: 'Sign on mobile', onScreenText: 'Fast sign' }],
    });
    const oldTake = await createAdStudioClip({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: ctx.otherBriefId,
      sceneId: 's1',
      sceneFingerprint: 'fp-1',
      kind: 'render',
      prompt: 'Office desk v1',
      model: 'veo',
      aspectRatio: '9:16',
      durationSeconds: 5,
      requestedBy: ctx.owner.id,
    });
    const v1Bytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 1]);
    await storage.upload(`test/${ctx.orgId}/${ctx.otherBriefId}/k1.mp4`, v1Bytes, 'video/mp4');
    await markAdStudioClipReady(oldTake, { gcsPath: `test/${ctx.orgId}/${ctx.otherBriefId}/k1.mp4` });

    const bestTake = await createAdStudioClip({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: ctx.otherBriefId,
      sceneId: 's1',
      sceneFingerprint: 'fp-1',
      kind: 'render',
      prompt: 'Office desk v2',
      model: 'veo',
      aspectRatio: '9:16',
      durationSeconds: 5,
      requestedBy: ctx.owner.id,
    });
    const v2Bytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 2]);
    await storage.upload(`test/${ctx.orgId}/${ctx.otherBriefId}/k2.mp4`, v2Bytes, 'video/mp4');
    await markAdStudioClipReady(bestTake, { gcsPath: `test/${ctx.orgId}/${ctx.otherBriefId}/k2.mp4` });
    await chooseAdStudioClip(ctx.orgId, ctx.projectId, ctx.otherBriefId, oldTake.id);

    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const { token: standardToken } = await makeLink(ctx, { briefIds: [ctx.otherBriefId] });
    const { token: preToken } = await makeLink(ctx, { briefIds: [ctx.otherBriefId], includeDrafts: true, includeResults: false });

    // Standard link hides unfinished briefs and refuses pre-publication clip streaming.
    expect((await loadSharedAds(standardToken))?.briefs).toEqual([]);
    getServerSessionMock.mockResolvedValue(null);
    expect(
      (await sharedClip(request('GET'), { params: Promise.resolve({ token: standardToken, briefId: ctx.otherBriefId, clipId: oldTake.id }) })).status,
    ).toBe(404);

    // Pre-publication link returns the drafted brief with scenes and streams only the chosen ready clip.
    const prePage = await loadSharedAds(preToken);
    expect(prePage?.includeDrafts).toBe(true);
    expect(prePage?.briefs).toHaveLength(1);
    expect(prePage?.briefs[0]?.scenes?.[0]?.clipSrc).toBe(`/api/share/ads/${preToken}/briefs/${ctx.otherBriefId}/clips/${oldTake.id}`);

    const clipOk = await sharedClip(request('GET'), { params: Promise.resolve({ token: preToken, briefId: ctx.otherBriefId, clipId: oldTake.id }) });
    expect(clipOk.status).toBe(200);
    expect(Buffer.from(await clipOk.arrayBuffer())).toEqual(v1Bytes);

    // Unselected alternate clip & wrong brief stay 404 even on includeDrafts links.
    expect(
      (await sharedClip(request('GET'), { params: Promise.resolve({ token: preToken, briefId: ctx.otherBriefId, clipId: bestTake.id }) })).status,
    ).toBe(404);
    expect(
      (await sharedClip(request('GET'), { params: Promise.resolve({ token: preToken, briefId: ctx.briefId, clipId: oldTake.id }) })).status,
    ).toBe(404);
  });
});
