import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GrowthSiteAnalysis, GrowthTargetDraft } from '@growthos/shared';
import {
  acquireGrowthPilotLease,
  createOrganizationWithOwner,
  createProject,
  decideGrowthProposal,
  ensureUserForFirebaseSession,
  finishGrowthTargetAds,
  finishGrowthTargetChange,
  getGrowthTarget,
  getPublishedGrowthLanding,
  GrowthChangeRequestEmptyError,
  GrowthTargetChangeNotAllowedError,
  growthTargetChangeFacts,
  linkGrowthTargetAds,
  listGrowthActivity,
  listGrowthProposals,
  markGrowthAdsPublished,
  proposeGrowthLandingChange,
  saveGrowthLandingDraft,
  saveGrowthPilotAnalysis,
  saveGrowthPublishProposal,
  startGrowthPilot,
  startGrowthTargetChange,
  updateGrowthProposalLandingContent,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('growth-pilot-change-tests');
});

const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;

const ANALYSIS: GrowthSiteAnalysis = {
  businessName: 'EasySign',
  summary: 'Digital signatures over WhatsApp.',
  language: 'en',
  offerings: [{ kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', forWhom: 'Small law firms', why: 'Worth it' }],
  audiences: [],
};
const DRAFTS: GrowthTargetDraft[] = [{ kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', audience: 'Small law firms', reason: 'The main service' }];
const CONTENT = { eyebrow: 'For offices', headline: 'Sign fast', subheadline: 'On WhatsApp', benefits: [{ title: 'Fast', text: 'Seconds' }], steps: [], faq: [], ctaText: 'Start', closingHeadline: 'Ready?' };
const PUBLISH = { destination: 'meta' as const, imageIds: ['i1'], dailyBudget: 20, linkUrl: 'https://app/lp/abc', campaignName: 'EasySign - Pro', countries: ['IL'] };

/** An approved target whose first ads are made and approved. */
async function targetWithApprovedAds() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Change Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const scope = { organizationId: organization.id, projectId: project.id, actorId: owner.id };
  const pilot = await startGrowthPilot({ ...scope, siteUrl: 'easysign.co.il' });
  const token = await acquireGrowthPilotLease(pilot);
  await saveGrowthPilotAnalysis({ pilot, token: token!, analysis: ANALYSIS, pages: [], drafts: DRAFTS, generatedBy: { provider: 'gemini', model: 'm' } });
  const [idea] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
  await decideGrowthProposal({ ...scope, proposalId: idea.id, decision: 'approve' });
  const targetId = idea.target_id!;
  await linkGrowthTargetAds({ ...scope, targetId, briefId: 'brief-1', runId: 'run-1' });
  await finishGrowthTargetAds({ ...scope, targetId, previewImageIds: ['i1'] });
  const ads = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.kind === 'ads')!;
  await decideGrowthProposal({ ...scope, proposalId: ads.id, decision: 'approve' });
  return { scope, pilot, targetId };
}

describe('changes the person asks for on an approved target', () => {
  it('redoes approved ads on request: new ones come back for a decision, and the request is kept with how it went', async () => {
    const { scope, pilot, targetId } = await targetWithApprovedAds();
    const asked = await startGrowthTargetChange({ ...scope, targetId, area: 'ads', text: '  A shorter  headline ' });
    expect(asked.change_requests).toEqual([expect.objectContaining({ area: 'ads', text: 'A shorter headline', outcome: 'pending', previous_ads_status: 'approved', by: scope.actorId })]);
    // The same part cannot be asked for twice while the first is being made.
    await expect(startGrowthTargetChange({ ...scope, targetId, area: 'ads', text: 'Again' })).rejects.toBeInstanceOf(GrowthTargetChangeNotAllowedError);

    await linkGrowthTargetAds({ ...scope, targetId, briefId: 'brief-1', runId: 'run-2' });
    await finishGrowthTargetAds({ ...scope, targetId, previewImageIds: ['new'] });
    const target = await getGrowthTarget(scope.organizationId, scope.projectId, targetId);
    expect(target.ads_status).toBe('ready');
    expect(target.change_requests?.[0]).toMatchObject({ outcome: 'done', failure_code: null });
    const ads = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).filter((row) => row.kind === 'ads');
    expect(ads.map((row) => row.status)).toEqual(['approved', 'pending']);
    expect(ads[1].preview_image_ids).toEqual(['new']);

    const activity = await listGrowthActivity(scope.organizationId, scope.projectId, pilot.id);
    const asking = activity.find((row) => row.kind === 'change_requested');
    expect(asking).toMatchObject({ target_id: targetId, subject: 'Digital signature', actor: scope.actorId });
    expect(activity.filter((row) => row.kind === 'ads_ready').every((row) => row.target_id === targetId)).toBe(true);
  });

  it('puts approved ads back as they were when the redo fails, and says why', async () => {
    const { scope, pilot, targetId } = await targetWithApprovedAds();
    await startGrowthTargetChange({ ...scope, targetId, area: 'ads', text: 'Brighter' });
    await linkGrowthTargetAds({ ...scope, targetId, briefId: 'brief-1', runId: 'run-2' });
    const failed = await finishGrowthTargetAds({ ...scope, targetId, previewImageIds: [], failureCode: 'quota_exceeded' });
    expect(failed).toMatchObject({ ads_status: 'approved', ads_failure: 'quota_exceeded' });
    expect(failed.change_requests?.[0]).toMatchObject({ outcome: 'failed', failure_code: 'quota_exceeded' });
    const kinds = (await listGrowthActivity(scope.organizationId, scope.projectId, pilot.id)).map((row) => row.kind);
    expect(kinds).toContain('revision_failed');
    expect(kinds).not.toContain('ads_failed');
  });

  it('refuses an empty request and a part that cannot be redone yet', async () => {
    const { scope, targetId } = await targetWithApprovedAds();
    await expect(startGrowthTargetChange({ ...scope, targetId, area: 'ads', text: '   ' })).rejects.toBeInstanceOf(GrowthChangeRequestEmptyError);
    // No landing page and no audience were made for it yet.
    await expect(startGrowthTargetChange({ ...scope, targetId, area: 'landing', text: 'Shorter' })).rejects.toBeInstanceOf(GrowthTargetChangeNotAllowedError);
    await expect(startGrowthTargetChange({ ...scope, targetId, area: 'audience', text: 'Older' })).rejects.toBeInstanceOf(GrowthTargetChangeNotAllowedError);
  });

  it('closes a pending decision to publish the old ads, and proposes publishing again once new ones are approved', async () => {
    const { scope, pilot, targetId } = await targetWithApprovedAds();
    const publish = await saveGrowthPublishProposal({ ...scope, targetId, plan: PUBLISH });
    await startGrowthTargetChange({ ...scope, targetId, area: 'ads', text: 'Other photos' });
    const proposals = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    expect(proposals.find((row) => row.id === publish.id)?.status).toBe('rejected');
    expect((await getGrowthTarget(scope.organizationId, scope.projectId, targetId)).publish_status).toBe('none');
  });

  it('new ads for live ones: approving them proposes publishing again (the old ones keep their record until replaced)', async () => {
    const { scope, pilot, targetId } = await targetWithApprovedAds();
    const publish = await saveGrowthPublishProposal({ ...scope, targetId, plan: PUBLISH });
    await markGrowthAdsPublished({ ...scope, proposalId: publish.id, exportIds: ['e1'], dailyBudget: 20 });
    await startGrowthTargetChange({ ...scope, targetId, area: 'ads', text: 'A new headline' });
    // The old ads were published but never turned on: that decision is closed with them.
    const activate = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.kind === 'activate');
    expect(activate?.status).toBe('rejected');
    expect((await getGrowthTarget(scope.organizationId, scope.projectId, targetId)).publish_status).toBe('published');

    await linkGrowthTargetAds({ ...scope, targetId, briefId: 'brief-1', runId: 'run-2' });
    await finishGrowthTargetAds({ ...scope, targetId, previewImageIds: ['new'] });
    const fresh = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.kind === 'ads' && row.status === 'pending')!;
    await decideGrowthProposal({ ...scope, proposalId: fresh.id, decision: 'approve' });
    const target = await getGrowthTarget(scope.organizationId, scope.projectId, targetId);
    expect(target).toMatchObject({ ads_status: 'approved', publish_status: 'none', ad_export_ids: ['e1'] });
  });

  it('new words for a public page wait for approval; declining keeps the live page, approving puts them live', async () => {
    const { scope, pilot, targetId } = await targetWithApprovedAds();
    const page = await saveGrowthLandingDraft({ ...scope, targetId, content: CONTENT, language: 'en', siteUrl: 'https://a.co/' });
    const first = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.kind === 'landing_page')!;
    await decideGrowthProposal({ ...scope, proposalId: first.id, decision: 'approve' });

    await startGrowthTargetChange({ ...scope, targetId, area: 'landing', text: 'Shorter' });
    const declined = await proposeGrowthLandingChange({ ...scope, targetId, content: { ...CONTENT, headline: 'Declined words' } });
    await finishGrowthTargetChange({ ...scope, targetId, area: 'landing' });
    expect(declined).toMatchObject({ kind: 'landing_page', status: 'pending', landing_page_id: page.id, landing_content: { headline: 'Declined words' } });
    expect((await getPublishedGrowthLanding(page.slug))?.content.headline).toBe('Sign fast');
    await decideGrowthProposal({ ...scope, proposalId: declined.id, decision: 'reject' });
    expect((await getPublishedGrowthLanding(page.slug))?.content.headline).toBe('Sign fast');
    expect((await getGrowthTarget(scope.organizationId, scope.projectId, targetId)).landing_status).toBe('published');

    const again = await proposeGrowthLandingChange({ ...scope, targetId, content: { ...CONTENT, headline: 'New words' } });
    await updateGrowthProposalLandingContent({ ...scope, proposalId: again.id, content: { ...CONTENT, headline: 'Newer words' } });
    expect((await getPublishedGrowthLanding(page.slug))?.content.headline).toBe('Sign fast');
    await decideGrowthProposal({ ...scope, proposalId: again.id, decision: 'approve' });
    expect((await getPublishedGrowthLanding(page.slug))?.content.headline).toBe('Newer words');
  });

  it('records a failed change on the target and in the feed, and says which parts can be changed', async () => {
    const { scope, pilot, targetId } = await targetWithApprovedAds();
    await saveGrowthLandingDraft({ ...scope, targetId, content: CONTENT, language: 'en', siteUrl: 'https://a.co/' });
    await startGrowthTargetChange({ ...scope, targetId, area: 'landing', text: 'Warmer' });
    expect(growthTargetChangeFacts(await getGrowthTarget(scope.organizationId, scope.projectId, targetId)).pendingAreas).toEqual(['landing']);
    const failed = await finishGrowthTargetChange({ ...scope, targetId, area: 'landing', failureCode: 'invalid_output' });
    expect(failed.change_requests?.[0]).toMatchObject({ area: 'landing', outcome: 'failed', failure_code: 'invalid_output' });
    expect(growthTargetChangeFacts(failed).pendingAreas).toEqual([]);
    const row = (await listGrowthActivity(scope.organizationId, scope.projectId, pilot.id)).find((entry) => entry.kind === 'revision_failed');
    expect(row?.target_id).toBe(targetId);
  });
});
