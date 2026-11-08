import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, type GrowthSiteAnalysis, type GrowthTargetDraft } from '@growthos/shared';
import {
  acquireGrowthPilotLease,
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  decideGrowthProposal,
  ensureUserForFirebaseSession,
  finishGrowthTargetAds,
  getAdStudioBrief,
  getEffectiveGrowthThresholds,
  getGrowthPlatformThresholds,
  getGrowthProjectThresholds,
  getGrowthTarget,
  getLiveGrowthTarget,
  GrowthProposalNeedsPlatformError,
  GrowthProposalNotPendingError,
  GrowthSuggestionThresholdsInvalidError,
  GrowthTargetNotLiveError,
  linkGrowthTargetAds,
  listAuditLogEntriesForOrg,
  listGrowthActivity,
  listGrowthProposals,
  markGrowthAdsPublished,
  markGrowthLiveAudienceApplied,
  recordGrowthBudgetChange,
  recordGrowthBudgetChangeFailure,
  recordGrowthLiveAudienceFailure,
  saveGrowthAudienceProposal,
  saveGrowthPilotAnalysis,
  saveGrowthPublishProposal,
  setGrowthPlatformThresholds,
  setGrowthProjectThresholds,
  startGrowthPilot,
  startGrowthTargetChange,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('growth-pilot-live-tests');
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
const PUBLISH = { destination: 'meta' as const, imageIds: ['i1'], dailyBudget: 20, linkUrl: 'https://app/lp/abc', campaignName: 'EasySign - Pro', countries: ['IL'] };
const PLAN = {
  summary: 'Freelancers in Israel',
  targeting: { countries: ['IL'], ageMin: 30, ageMax: 50, genders: [], customAudiences: [], interests: [{ id: '6003', name: 'Freelancer', sizeLower: 100, sizeUpper: 200 }] },
  unresolvedInterests: [],
  reach: null,
  meta: 'ok',
};
const REFS = { ad_account_id: '99', campaign_id: '2385001', ad_set_ids: ['2385002'], ad_ids: ['2385003', '2385004'] };

/** A target whose ads are published (still off) on Meta, with a real brief and an approved audience. */
async function publishedTarget() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Live Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const scope = { organizationId: organization.id, projectId: project.id, actorId: owner.id };
  const pilot = await startGrowthPilot({ ...scope, siteUrl: 'easysign.co.il' });
  const token = await acquireGrowthPilotLease(pilot);
  await saveGrowthPilotAnalysis({ pilot, token: token!, analysis: ANALYSIS, pages: [], drafts: DRAFTS, generatedBy: { provider: 'gemini', model: 'm' } });
  const [idea] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
  await decideGrowthProposal({ ...scope, proposalId: idea.id, decision: 'approve' });
  const targetId = idea.target_id!;
  const brief = await createAdStudioBrief({
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    input: { name: 'Sign', objective: 'Trials', productDescription: 'E-sign', landingPageUrl: null, format: 'vertical', language: 'en', targetSeconds: 15 },
    createdByUserId: scope.actorId,
  });
  await linkGrowthTargetAds({ ...scope, targetId, briefId: brief.id, runId: 'run-1' });
  await finishGrowthTargetAds({ ...scope, targetId, previewImageIds: ['i1'] });
  const ads = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.kind === 'ads')!;
  await decideGrowthProposal({ ...scope, proposalId: ads.id, decision: 'approve' });
  const audience = await saveGrowthAudienceProposal({ ...scope, targetId, plan: { ...PLAN, targeting: { ...PLAN.targeting, ageMin: 25 } } });
  expect(audience.applies_to_live).toBe(false);
  await decideGrowthProposal({ ...scope, proposalId: audience.id, decision: 'approve' });
  const publish = await saveGrowthPublishProposal({ ...scope, targetId, plan: PUBLISH });
  await markGrowthAdsPublished({ ...scope, proposalId: publish.id, exportIds: ['e1', 'e2'], dailyBudget: 35, metaRefs: REFS, currency: 'ILS' });
  return { scope, pilot, targetId, briefId: brief.id };
}

describe('the live ads of a target', () => {
  it('remembers where the published ads live on Meta, and the budget and currency they run with', async () => {
    const { scope, targetId } = await publishedTarget();
    const target = await getGrowthTarget(scope.organizationId, scope.projectId, targetId);
    expect(target).toMatchObject({ publish_status: 'published', daily_budget: 35, budget_currency: 'ILS', meta_refs: REFS, ad_export_ids: ['e1', 'e2'] });
    expect((await getLiveGrowthTarget(scope.organizationId, scope.projectId, targetId)).id).toBe(targetId);
  });

  it('records a budget change on the target, in the feed (amount and currency) and in the audit trail; a failure only in the feed and the trail', async () => {
    const { scope, pilot, targetId } = await publishedTarget();
    await recordGrowthBudgetChange({ ...scope, targetId, dailyBudget: 60, previousDailyBudget: 35, currency: 'ILS' });
    expect(await getGrowthTarget(scope.organizationId, scope.projectId, targetId)).toMatchObject({ daily_budget: 60, budget_currency: 'ILS' });
    await recordGrowthBudgetChangeFailure({ ...scope, targetId, dailyBudget: 90, failureCode: 'rejected' });
    expect((await getGrowthTarget(scope.organizationId, scope.projectId, targetId)).daily_budget).toBe(60);
    const feed = await listGrowthActivity(scope.organizationId, scope.projectId, pilot.id);
    expect(feed.find((row) => row.kind === 'budget_changed')).toMatchObject({ count: 60, detail: 'ILS', target_id: targetId, actor: scope.actorId });
    expect(feed.find((row) => row.kind === 'budget_change_failed')).toMatchObject({ count: 90, detail: 'rejected', target_id: targetId });
    const actions = (await listAuditLogEntriesForOrg(scope.organizationId)).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['growth_pilot.budget_changed', 'growth_pilot.budget_change_failed']));
  });

  it('has nothing live to change before the ads are published', async () => {
    const { scope } = await publishedTarget();
    const owner = scope.actorId;
    const { organization } = await createOrganizationWithOwner({ name: 'Other', ownerUserId: owner });
    const { project } = await createProject({ organizationId: organization.id, name: 'Site' });
    const other = { organizationId: organization.id, projectId: project.id, actorId: owner };
    const pilot = await startGrowthPilot({ ...other, siteUrl: 'other.co.il' });
    const token = await acquireGrowthPilotLease(pilot);
    await saveGrowthPilotAnalysis({ pilot, token: token!, analysis: ANALYSIS, pages: [], drafts: DRAFTS, generatedBy: { provider: 'gemini', model: 'm' } });
    const [idea] = await listGrowthProposals(other.organizationId, other.projectId, pilot.id);
    await decideGrowthProposal({ ...other, proposalId: idea.id, decision: 'approve' });
    await expect(getLiveGrowthTarget(other.organizationId, other.projectId, idea.target_id!)).rejects.toBeInstanceOf(GrowthTargetNotLiveError);
  });

  it('asks for a new audience on live ads without dropping the decision to turn them on; approving acts on Meta, declining keeps the live audience', async () => {
    const { scope, pilot, targetId } = await publishedTarget();
    await startGrowthTargetChange({ ...scope, targetId, area: 'audience', text: 'Older people' });
    const proposals = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    expect(proposals.find((row) => row.kind === 'activate')?.status).toBe('pending');
    expect((await getGrowthTarget(scope.organizationId, scope.projectId, targetId)).publish_status).toBe('published');

    const live = await saveGrowthAudienceProposal({ ...scope, targetId, plan: PLAN });
    expect(live).toMatchObject({ applies_to_live: true, previous_audience_status: 'approved' });
    await expect(decideGrowthProposal({ ...scope, proposalId: live.id, decision: 'approve' })).rejects.toBeInstanceOf(GrowthProposalNeedsPlatformError);
    await decideGrowthProposal({ ...scope, proposalId: live.id, decision: 'reject' });
    expect((await getGrowthTarget(scope.organizationId, scope.projectId, targetId)).audience_status).toBe('approved');
  });

  it('applies an approved live audience: the brief keeps it, the target its new ad sets, the feed says so; a failure leaves the proposal waiting', async () => {
    const { scope, pilot, targetId, briefId } = await publishedTarget();
    const live = await saveGrowthAudienceProposal({ ...scope, targetId, plan: PLAN });
    await recordGrowthLiveAudienceFailure({ ...scope, proposalId: live.id, failureCode: 'rejected' });
    const waiting = (await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id)).find((row) => row.id === live.id);
    expect(waiting?.status).toBe('pending');

    await markGrowthLiveAudienceApplied({ ...scope, proposalId: live.id, mode: 'replaced', adSetIds: ['2385009'], adIds: ['2385010', '2385011'] });
    const target = await getGrowthTarget(scope.organizationId, scope.projectId, targetId);
    expect(target).toMatchObject({ audience_status: 'approved', meta_refs: { ...REFS, ad_set_ids: ['2385009'], ad_ids: ['2385010', '2385011'] } });
    expect((await getAdStudioBrief(scope.organizationId, scope.projectId, briefId)).meta_targeting).toMatchObject({ ageMin: 30, ageMax: 50 });
    const feed = await listGrowthActivity(scope.organizationId, scope.projectId, pilot.id);
    expect(feed.find((row) => row.kind === 'audience_applied')).toMatchObject({ detail: 'replaced', target_id: targetId });
    expect(feed.find((row) => row.kind === 'audience_apply_failed')).toMatchObject({ detail: 'rejected', target_id: targetId });
    // Decided once.
    await expect(markGrowthLiveAudienceApplied({ ...scope, proposalId: live.id, mode: 'updated', adSetIds: [], adIds: [] })).rejects.toBeInstanceOf(GrowthProposalNotPendingError);
  });
});

describe('Growth Pilot suggestion thresholds', () => {
  async function project() {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
    const { organization } = await createOrganizationWithOwner({ name: 'Threshold Org', ownerUserId: owner.id });
    const { project: created } = await createProject({ organizationId: organization.id, name: 'Website' });
    return { organizationId: organization.id, projectId: created.id, actorId: owner.id };
  }

  it('layers the project over the platform over the built-in defaults, and resets each', async () => {
    const operator = unique('operator');
    await setGrowthPlatformThresholds({ thresholds: null, actorId: operator });
    const scope = await project();
    expect(await getEffectiveGrowthThresholds(scope.organizationId, scope.projectId)).toEqual(DEFAULT_GROWTH_SUGGESTION_THRESHOLDS);

    const platform = await setGrowthPlatformThresholds({ thresholds: { lowCtr: 0.01, noClicksAfterDays: 5 }, actorId: operator });
    expect(platform.overrides).toEqual({ lowCtr: 0.01, noClicksAfterDays: 5 });
    expect(platform.history.at(-1)).toMatchObject({ by: operator, after: { lowCtr: 0.01, noClicksAfterDays: 5 } });

    const own = await setGrowthProjectThresholds({ ...scope, thresholds: { lowCtr: 0.02 } });
    expect(own).toMatchObject({ overrides: { lowCtr: 0.02 }, platform: { lowCtr: 0.01, noClicksAfterDays: 5 } });
    expect(own.effective).toEqual({ ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, lowCtr: 0.02, noClicksAfterDays: 5 });

    const reset = await setGrowthProjectThresholds({ ...scope, thresholds: null });
    expect(reset.overrides).toEqual({});
    expect(reset.effective).toEqual({ ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, lowCtr: 0.01, noClicksAfterDays: 5 });
    const actions = (await listAuditLogEntriesForOrg(scope.organizationId)).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['growth_pilot.thresholds_changed', 'growth_pilot.thresholds_reset']));

    await setGrowthPlatformThresholds({ thresholds: null, actorId: operator });
    expect((await getGrowthPlatformThresholds()).overrides).toEqual({});
    expect((await getGrowthProjectThresholds(scope.organizationId, scope.projectId)).effective).toEqual(DEFAULT_GROWTH_SUGGESTION_THRESHOLDS);
  });

  it('refuses out-of-range or unknown values and saves nothing', async () => {
    const scope = await project();
    await expect(setGrowthProjectThresholds({ ...scope, thresholds: { lowCtr: 3 } })).rejects.toMatchObject({ name: 'GrowthSuggestionThresholdsInvalidError', invalid: ['lowCtr'] });
    await expect(setGrowthProjectThresholds({ ...scope, thresholds: { nope: 1 } })).rejects.toBeInstanceOf(GrowthSuggestionThresholdsInvalidError);
    await expect(setGrowthPlatformThresholds({ thresholds: { noClicksAfterDays: 0.5 }, actorId: 'op' })).rejects.toBeInstanceOf(GrowthSuggestionThresholdsInvalidError);
    expect((await getGrowthProjectThresholds(scope.organizationId, scope.projectId)).overrides).toEqual({});
  });
});
