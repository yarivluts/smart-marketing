import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GrowthSiteAnalysis, GrowthTargetDraft } from '@growthos/shared';
import {
  acquireGrowthPilotLease,
  addRequestedGrowthTarget,
  completeGrowthProposalRevision,
  createOrganizationWithOwner,
  createProject,
  decideGrowthProposal,
  failGrowthLanding,
  getPublishedGrowthLanding,
  saveGrowthLandingDraft,
  updateGrowthLandingContent,
  finishGrowthTargetAds,
  linkGrowthTargetAds,
  ensureUserForFirebaseSession,
  failGrowthPilotAnalysis,
  getCurrentGrowthPilot,
  GrowthChangeRequestEmptyError,
  GrowthPilotSiteInvalidError,
  GrowthProposalNotPendingError,
  listGrowthActivity,
  listGrowthProposals,
  listGrowthTargets,
  requestGrowthProposalChange,
  saveGrowthPilotAnalysis,
  setGrowthPilotPaused,
  startGrowthPilot,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('growth-pilot-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const ANALYSIS: GrowthSiteAnalysis = {
  businessName: 'EasySign',
  summary: 'Digital signatures over WhatsApp.',
  language: 'en',
  offerings: [{ kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', forWhom: 'Small law firms', why: 'Worth it' }],
  audiences: [{ name: 'Law firms', description: 'Small firms', needs: 'Faster signatures', why: 'Worth it' }],
};
const DRAFTS: GrowthTargetDraft[] = [
  { kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', audience: 'Small law firms', reason: 'The main service' },
  { kind: 'audience', name: 'Law firms', description: 'Small firms', audience: 'Faster signatures', reason: 'They sign daily' },
];

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Pilot Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { organizationId: organization.id, projectId: project.id, actorId: owner.id };
}

async function analyzedPilot() {
  const scope = await setup();
  const pilot = await startGrowthPilot({ ...scope, siteUrl: 'easysign.co.il' });
  const token = await acquireGrowthPilotLease(pilot);
  if (!token) throw new Error('no lease');
  await saveGrowthPilotAnalysis({ pilot, token, analysis: ANALYSIS, pages: [{ url: 'https://easysign.co.il/', title: 'EasySign' }], drafts: DRAFTS, generatedBy: { provider: 'gemini', model: 'm' } });
  return { scope, pilot };
}

describe('Growth Pilot', () => {
  it('starts on a website, refuses what is not one, and starting over archives the previous pilot', async () => {
    const scope = await setup();
    await expect(startGrowthPilot({ ...scope, siteUrl: 'not a site' })).rejects.toBeInstanceOf(GrowthPilotSiteInvalidError);
    const first = await startGrowthPilot({ ...scope, siteUrl: 'easysign.co.il' });
    expect(first).toMatchObject({ site_url: 'https://easysign.co.il/', status: 'analyzing' });
    const second = await startGrowthPilot({ ...scope, siteUrl: 'https://www.other.co.il' });
    expect((await getCurrentGrowthPilot(scope.organizationId, scope.projectId))?.id).toBe(second.id);
    const activity = await listGrowthActivity(scope.organizationId, scope.projectId, second.id);
    expect(activity.map((row) => row.kind)).toEqual(['pilot_started']);
  });

  it('lets one caller read the site at a time, then saves the analysis with every target as a pending proposal', async () => {
    const scope = await setup();
    const pilot = await startGrowthPilot({ ...scope, siteUrl: 'easysign.co.il' });
    const token = await acquireGrowthPilotLease(pilot);
    expect(token).toBeTruthy();
    expect(await acquireGrowthPilotLease(pilot)).toBeNull();
    expect(await saveGrowthPilotAnalysis({ pilot, token: 'not-mine', analysis: ANALYSIS, pages: [], drafts: DRAFTS, generatedBy: { provider: 'gemini', model: 'm' } })).toBeNull();
    const saved = await saveGrowthPilotAnalysis({ pilot, token: token!, analysis: ANALYSIS, pages: [{ url: 'https://easysign.co.il/', title: 'EasySign' }], drafts: DRAFTS, generatedBy: { provider: 'gemini', model: 'm' } });
    expect(saved).toMatchObject({ status: 'active', analysis: ANALYSIS, lease_token: null });
    expect(await acquireGrowthPilotLease(pilot)).toBeNull();
    const targets = await listGrowthTargets(scope.organizationId, scope.projectId, pilot.id);
    expect(targets.map((target) => [target.name, target.status, target.origin])).toEqual([
      ['Digital signature', 'proposed', 'site'],
      ['Law firms', 'proposed', 'site'],
    ]);
    const proposals = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    expect(proposals.every((proposal) => proposal.status === 'pending' && proposal.kind === 'target')).toBe(true);
    const activity = await listGrowthActivity(scope.organizationId, scope.projectId, pilot.id);
    expect(activity.find((row) => row.kind === 'targets_proposed')?.count).toBe(2);
    expect(activity.find((row) => row.kind === 'site_read')?.count).toBe(1);
  });

  it('records a failed read so the person can start again', async () => {
    const scope = await setup();
    const pilot = await startGrowthPilot({ ...scope, siteUrl: 'easysign.co.il' });
    const token = await acquireGrowthPilotLease(pilot);
    const failed = await failGrowthPilotAnalysis({ pilot, token: token!, code: 'site_unreachable' });
    expect(failed).toMatchObject({ status: 'failed', failure_code: 'site_unreachable' });
  });

  it('approves a target as proposed and rejects another; a decided proposal cannot be decided again', async () => {
    const { scope, pilot } = await analyzedPilot();
    const [first, second] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    await decideGrowthProposal({ ...scope, proposalId: first.id, decision: 'approve' });
    await decideGrowthProposal({ ...scope, proposalId: second.id, decision: 'reject' });
    await expect(decideGrowthProposal({ ...scope, proposalId: first.id, decision: 'reject' })).rejects.toBeInstanceOf(GrowthProposalNotPendingError);
    const targets = await listGrowthTargets(scope.organizationId, scope.projectId, pilot.id);
    expect(targets.map((target) => target.status)).toEqual(['active', 'rejected']);
  });

  it('holds a proposal while the AI rewrites it on request, then applies the rewrite when approved', async () => {
    const { scope, pilot } = await analyzedPilot();
    const [proposal] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    await expect(requestGrowthProposalChange({ ...scope, proposalId: proposal.id, text: '   ' })).rejects.toBeInstanceOf(GrowthChangeRequestEmptyError);
    const revising = await requestGrowthProposalChange({ ...scope, proposalId: proposal.id, text: ' Only  Tel Aviv firms ' });
    expect(revising.status).toBe('revising');
    expect(revising.change_requests).toEqual([expect.objectContaining({ text: 'Only Tel Aviv firms', outcome: 'pending' })]);
    await expect(decideGrowthProposal({ ...scope, proposalId: proposal.id, decision: 'approve' })).rejects.toBeInstanceOf(GrowthProposalNotPendingError);

    const revised = await completeGrowthProposalRevision({ ...scope, proposalId: proposal.id, draft: { ...DRAFTS[0], audience: 'Tel Aviv law firms' } });
    expect(revised).toMatchObject({ status: 'pending', draft: { audience: 'Tel Aviv law firms' } });
    expect(revised.change_requests[0].outcome).toBe('done');
    await decideGrowthProposal({ ...scope, proposalId: proposal.id, decision: 'approve' });
    const [target] = await listGrowthTargets(scope.organizationId, scope.projectId, pilot.id);
    expect(target).toMatchObject({ status: 'active', audience: 'Tel Aviv law firms' });
  });

  it('keeps the proposal as it was when the rewrite fails, and says so', async () => {
    const { scope, pilot } = await analyzedPilot();
    const [proposal] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    await requestGrowthProposalChange({ ...scope, proposalId: proposal.id, text: 'Shorter' });
    const back = await completeGrowthProposalRevision({ ...scope, proposalId: proposal.id, draft: null, failureCode: 'quota_exceeded' });
    expect(back).toMatchObject({ status: 'pending', draft: DRAFTS[0] });
    expect(back.change_requests[0]).toMatchObject({ outcome: 'failed', failure_code: 'quota_exceeded' });
  });

  it('adds a target the person asked for as a proposal, and pauses and resumes', async () => {
    const { scope, pilot } = await analyzedPilot();
    const proposal = await addRequestedGrowthTarget({ ...scope, pilotId: pilot.id, draft: { kind: 'audience', name: 'Accountants', description: 'd', audience: 'a', reason: 'r' } });
    expect(proposal.status).toBe('pending');
    const targets = await listGrowthTargets(scope.organizationId, scope.projectId, pilot.id);
    expect(targets.find((target) => target.name === 'Accountants')).toMatchObject({ origin: 'request', status: 'proposed' });
    expect((await setGrowthPilotPaused({ ...scope, pilotId: pilot.id, paused: true })).status).toBe('paused');
    expect((await setGrowthPilotPaused({ ...scope, pilotId: pilot.id, paused: false })).status).toBe('active');
    const kinds = (await listGrowthActivity(scope.organizationId, scope.projectId, pilot.id)).map((row) => row.kind);
    expect(kinds).toEqual(expect.arrayContaining(['target_requested', 'pilot_paused', 'pilot_resumed']));
  });

  it('makes ads for an approved target, puts them up for approval with previews, and approves them', async () => {
    const { scope, pilot } = await analyzedPilot();
    const [proposal] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    await decideGrowthProposal({ ...scope, proposalId: proposal.id, decision: 'approve' });
    const linked = await linkGrowthTargetAds({ ...scope, targetId: proposal.target_id!, briefId: 'brief-1', runId: 'run-1' });
    expect(linked).toMatchObject({ brief_id: 'brief-1', run_id: 'run-1', ads_status: 'building' });
    await finishGrowthTargetAds({ ...scope, targetId: proposal.target_id!, previewImageIds: ['i1', 'i2'] });
    const ads = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.kind === 'ads');
    expect(ads).toMatchObject({ status: 'pending', brief_id: 'brief-1', preview_image_ids: ['i1', 'i2'], target_id: proposal.target_id, draft: { name: 'Digital signature' } });
    await decideGrowthProposal({ ...scope, proposalId: ads!.id, decision: 'approve' });
    const target = (await listGrowthTargets(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.id === proposal.target_id);
    expect(target?.ads_status).toBe('approved');
    const kinds = (await listGrowthActivity(scope.organizationId, scope.projectId, pilot.id)).map((row) => row.kind);
    expect(kinds).toEqual(expect.arrayContaining(['ads_building', 'ads_ready']));
  });

  it('brings the same ads proposal back with new images after a change, or unchanged with the reason when the rebuild fails', async () => {
    const { scope, pilot } = await analyzedPilot();
    const [proposal] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    await decideGrowthProposal({ ...scope, proposalId: proposal.id, decision: 'approve' });
    const targetId = proposal.target_id!;
    await linkGrowthTargetAds({ ...scope, targetId, briefId: 'b', runId: 'r1' });
    await finishGrowthTargetAds({ ...scope, targetId, previewImageIds: ['old'] });
    const ads = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.kind === 'ads')!;

    await requestGrowthProposalChange({ ...scope, proposalId: ads.id, text: 'Brighter photos' });
    await linkGrowthTargetAds({ ...scope, targetId, briefId: 'b', runId: 'r2' });
    await finishGrowthTargetAds({ ...scope, targetId, previewImageIds: ['new'] });
    const back = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).filter((row) => row.kind === 'ads');
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ status: 'pending', preview_image_ids: ['new'] });
    expect(back[0].change_requests[0].outcome).toBe('done');

    await requestGrowthProposalChange({ ...scope, proposalId: ads.id, text: 'Darker' });
    const failed = await finishGrowthTargetAds({ ...scope, targetId, previewImageIds: [], failureCode: 'quota_exceeded' });
    expect(failed.ads_status).toBe('ready');
    const after = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.kind === 'ads')!;
    expect(after).toMatchObject({ status: 'pending', preview_image_ids: ['new'] });
    expect(after.change_requests[1]).toMatchObject({ outcome: 'failed', failure_code: 'quota_exceeded' });
  });

  it('says why a first build of ads failed', async () => {
    const { scope, pilot } = await analyzedPilot();
    const [proposal] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    await decideGrowthProposal({ ...scope, proposalId: proposal.id, decision: 'approve' });
    await linkGrowthTargetAds({ ...scope, targetId: proposal.target_id!, briefId: 'b', runId: 'r' });
    const failed = await finishGrowthTargetAds({ ...scope, targetId: proposal.target_id!, previewImageIds: [], failureCode: 'provider_billing' });
    expect(failed).toMatchObject({ ads_status: 'failed', ads_failure: 'provider_billing' });
    expect((await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).some((row) => row.kind === 'ads')).toBe(false);
  });

  const CONTENT = { eyebrow: 'For offices', headline: 'Sign fast', subheadline: 'On WhatsApp', benefits: [{ title: 'Fast', text: 'Seconds' }], steps: [], faq: [], ctaText: 'Start', closingHeadline: 'Ready?' };

  it('keeps a written landing page private until the person approves it, then serves it at its address', async () => {
    const { scope, pilot } = await analyzedPilot();
    const [proposal] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    await decideGrowthProposal({ ...scope, proposalId: proposal.id, decision: 'approve' });
    const page = await saveGrowthLandingDraft({ ...scope, targetId: proposal.target_id!, content: CONTENT, language: 'he', siteUrl: 'https://easy-sign.co.il/' });
    expect(page.slug).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(page).toMatchObject({ status: 'draft', cta_url: `https://easy-sign.co.il/?utm_source=growthos&utm_medium=landing_page&utm_campaign=${page.slug}` });
    expect(await getPublishedGrowthLanding(page.slug)).toBeNull();

    const landing = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.kind === 'landing_page')!;
    expect(landing).toMatchObject({ status: 'pending', landing_page_id: page.id });
    await requestGrowthProposalChange({ ...scope, proposalId: landing.id, text: 'Shorter' });
    await updateGrowthLandingContent({ ...scope, pageId: page.id, content: { ...CONTENT, headline: 'Sign' } });
    await completeGrowthProposalRevision({ ...scope, proposalId: landing.id, draft: landing.draft ?? null });
    await decideGrowthProposal({ ...scope, proposalId: landing.id, decision: 'approve' });

    const live = await getPublishedGrowthLanding(page.slug);
    expect(live).toMatchObject({ status: 'published', content: { headline: 'Sign' } });
    expect(live?.published_on).toBeTruthy();
    const target = (await listGrowthTargets(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.id === proposal.target_id);
    expect(target).toMatchObject({ landing_status: 'published', landing_page_id: page.id });
    const kinds = (await listGrowthActivity(scope.organizationId, scope.projectId, pilot.id)).map((row) => row.kind);
    expect(kinds).toEqual(expect.arrayContaining(['landing_ready', 'landing_published']));
  });

  it('a rejected page never goes public, a failure says why, and a bad address finds nothing', async () => {
    const { scope, pilot } = await analyzedPilot();
    const [first, second] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    await decideGrowthProposal({ ...scope, proposalId: first.id, decision: 'approve' });
    const page = await saveGrowthLandingDraft({ ...scope, targetId: first.target_id!, content: CONTENT, language: 'en', siteUrl: 'https://a.co/' });
    const landing = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.kind === 'landing_page')!;
    await decideGrowthProposal({ ...scope, proposalId: landing.id, decision: 'reject' });
    expect(await getPublishedGrowthLanding(page.slug)).toBeNull();

    const failed = await failGrowthLanding({ ...scope, targetId: second.target_id!, failureCode: 'quota_exceeded' });
    expect(failed).toMatchObject({ landing_status: 'failed', landing_failure: 'quota_exceeded' });
    expect(await getPublishedGrowthLanding('../../etc')).toBeNull();
    expect(await getPublishedGrowthLanding('nosuchslug123')).toBeNull();
  });
});
