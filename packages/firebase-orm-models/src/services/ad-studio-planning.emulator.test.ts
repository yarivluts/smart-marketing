import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AdStudioBriefInput, AdStudioPlan, AdStudioPlanSources } from '@growthos/shared';
import {
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideResourceAttachment,
  ensureAutomationTargetSeeded,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  getAdStudioBrief,
  getAdStudioCampaignEvidence,
  getAdStudioKeywordAccess,
  importExternalCampaignSnapshots,
  LocalKmsProvider,
  requestResourceAttachment,
  resolveAdStudioKeywordCredential,
  saveAdStudioPlan,
  saveAdStudioScript,
  setSharedCredentialSecret,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-planning-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Planning Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, orgId: organization.id, projectId: project.id };
}

const GOOGLE_ADS_SECRET = { developerToken: 'dev-token', clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'refresh-token', customerId: '1234567890' };

async function attachCredential(orgId: string, projectId: string, ownerId: string, provider: 'google_ads' | 'stripe', approve = true) {
  const credential = await createSharedCredential({ organizationId: orgId, name: `${provider} account`, provider, availableScopes: ['account'], createdByUserId: ownerId });
  const attachment = await requestResourceAttachment({ organizationId: orgId, projectId, resourceKind: 'credential', resourceId: credential.id, requestedByUserId: ownerId, scopeSelection: ['account'] });
  if (approve) await decideResourceAttachment({ organizationId: orgId, attachmentId: attachment.id, decidedByUserId: ownerId, approve: true });
  return credential;
}

describe('getAdStudioCampaignEvidence', () => {
  it('says no_campaigns for a project without any, never an empty list', async () => {
    const { orgId, projectId } = await setup();
    expect(await getAdStudioCampaignEvidence(orgId, projectId, null)).toEqual({ status: 'unavailable', reason: 'no_campaigns' });
  });

  it('lists the environment\'s campaigns live first with their imported ad copy', async () => {
    const { owner, orgId, projectId } = await setup();
    await importExternalCampaignSnapshots({
      organizationId: orgId,
      projectId,
      environmentId: 'env-prod',
      importedByUserId: owner.id,
      snapshots: [
        { externalCampaignId: 'meta-1', platform: 'meta_ads', name: 'Paused spring', status: 'paused', dailyBudgetUsd: 80, ads: [] },
        {
          externalCampaignId: 'google-1',
          platform: 'google_ads',
          name: 'Lawyers search',
          status: 'enabled',
          dailyBudgetUsd: 40,
          ads: [
            { adName: 'RSA 1', headline: 'Sign in 30 seconds', description: 'Legally binding' },
            { adName: 'Image only', imageUrl: 'https://example.com/a.png' },
          ],
        },
      ],
    });
    await ensureAutomationTargetSeeded({
      organizationId: orgId,
      projectId,
      environmentId: 'env-dev',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Dev only',
      initialDailyBudgetUsd: 5,
      seededByUserId: owner.id,
    });

    const evidence = await getAdStudioCampaignEvidence(orgId, projectId, 'env-prod');
    expect(evidence).toEqual({
      status: 'ok',
      campaigns: [
        { label: 'Lawyers search', platform: 'google_ads', status: 'enabled', dailyBudgetUsd: 40, ads: [{ headline: 'Sign in 30 seconds', primaryText: '', description: 'Legally binding' }] },
        { label: 'Paused spring', platform: 'meta_ads', status: 'paused', dailyBudgetUsd: 80, ads: [] },
      ],
    });
    const all = await getAdStudioCampaignEvidence(orgId, projectId, null);
    expect(all.status === 'ok' ? all.campaigns.map((campaign) => campaign.label) : []).toContain('Dev only');
  });
});

describe('Google Ads keyword access', () => {
  it('no credential, a pending attachment and another provider all read as no_google_ads_credential', async () => {
    const { owner, orgId, projectId } = await setup();
    expect(await getAdStudioKeywordAccess(orgId, projectId)).toEqual({ status: 'unavailable', reason: 'no_google_ads_credential' });
    await attachCredential(orgId, projectId, owner.id, 'stripe');
    await attachCredential(orgId, projectId, owner.id, 'google_ads', false);
    expect(await getAdStudioKeywordAccess(orgId, projectId)).toEqual({ status: 'unavailable', reason: 'no_google_ads_credential' });
  });

  it('an attached credential without a secret is credential_not_configured; with one, it decrypts in memory', async () => {
    const { owner, orgId, projectId } = await setup();
    const credential = await attachCredential(orgId, projectId, owner.id, 'google_ads');
    expect(await getAdStudioKeywordAccess(orgId, projectId)).toEqual({ status: 'unavailable', reason: 'credential_not_configured' });

    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    await setSharedCredentialSecret({ organizationId: orgId, credentialId: credential.id, secret: JSON.stringify(GOOGLE_ADS_SECRET), kms, actorId: owner.id });
    expect(await getAdStudioKeywordAccess(orgId, projectId)).toMatchObject({ status: 'ok', credentialName: 'google_ads account' });
    expect(await resolveAdStudioKeywordCredential(orgId, projectId, null)).toEqual({ status: 'unavailable', reason: 'vault_not_configured' });
    expect(await resolveAdStudioKeywordCredential(orgId, projectId, kms)).toEqual({ status: 'ok', credential: GOOGLE_ADS_SECRET });

    const otherKeys = generateLocalKmsKeyRing('v9');
    expect(await resolveAdStudioKeywordCredential(orgId, projectId, new LocalKmsProvider(otherKeys.keyRing, otherKeys.currentKeyId))).toEqual({
      status: 'unavailable',
      reason: 'credential_not_configured',
    });
    // Same key id, different key (a secret sealed with the dev key ring, read in prod): unreadable, not a crash.
    const sameIdOtherKey = generateLocalKmsKeyRing(currentKeyId);
    expect(await resolveAdStudioKeywordCredential(orgId, projectId, new LocalKmsProvider(sameIdOtherKey.keyRing, sameIdOtherKey.currentKeyId))).toEqual({
      status: 'unavailable',
      reason: 'credential_not_configured',
    });
  });

  it('a secret that is not a Google Ads credential is credential_not_configured', async () => {
    const { owner, orgId, projectId } = await setup();
    const credential = await attachCredential(orgId, projectId, owner.id, 'google_ads');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    await setSharedCredentialSecret({ organizationId: orgId, credentialId: credential.id, secret: JSON.stringify({ developerToken: 'only this' }), kms, actorId: owner.id });
    expect(await resolveAdStudioKeywordCredential(orgId, projectId, kms)).toEqual({ status: 'unavailable', reason: 'credential_not_configured' });
  });
});

const INPUT: AdStudioBriefInput = {
  name: 'Sign in 30 seconds',
  objective: 'Trial signups',
  productDescription: 'E-signatures for lawyers',
  landingPageUrl: 'https://example.com/lawyers',
  format: 'vertical',
  language: 'en',
  targetSeconds: 30,
};

const PLAN: AdStudioPlan = {
  summary: 'Lead with speed',
  audience: 'Solo lawyers',
  landingPageSummary: '',
  messagingAngles: ['Speed'],
  keywordThemes: [{ theme: 'E-signature', keywords: ['electronic signature'], evidence: 'keywords' }],
  recommendations: [{ title: 'Open on the claim', rationale: 'r', priority: 'high', evidence: [], unsupported: true }],
  marketNotes: ['Feeds autoplay muted'],
};

const SOURCES: AdStudioPlanSources = {
  landingPage: { status: 'unavailable', reason: 'timeout' },
  results: { status: 'unavailable', reason: 'warehouse_not_configured' },
  campaigns: { status: 'unavailable', reason: 'no_campaigns' },
  keywords: {
    status: 'ok',
    seedKeywords: ['e-signature'],
    seedUrl: null,
    language: 'languageConstants/1000',
    geoTargets: [],
    ideas: [{ keyword: 'electronic signature', avgMonthlySearches: 12100, competition: null, lowTopOfPageBid: null, highTopOfPageBid: null }],
  },
};

describe('saveAdStudioPlan', () => {
  it('stores the plan and its sources, marks a draft planned, and keeps a scripted brief scripted', async () => {
    const { owner, orgId, projectId } = await setup();
    const brief = await createAdStudioBrief({ organizationId: orgId, projectId, input: INPUT, createdByUserId: owner.id });
    expect(brief).toMatchObject({ plan: null, plan_sources: null, plan_generated_by: null });
    const generatedBy = { provider: 'gemini' as const, model: 'gemini-3.8-flash', generated_at: '2026-09-27T12:00:00.000Z' };

    await saveAdStudioPlan({ organizationId: orgId, projectId, briefId: brief.id, plan: PLAN, sources: SOURCES, generatedBy });
    const planned = await getAdStudioBrief(orgId, projectId, brief.id);
    expect(planned).toMatchObject({ status: 'planned', plan: PLAN, plan_sources: SOURCES, plan_generated_by: generatedBy });

    await saveAdStudioScript({ organizationId: orgId, projectId, briefId: brief.id, scenes: [{ id: 'a', durationSeconds: 5, visualPrompt: 'A desk', voiceover: '', onScreenText: '' }] });
    await saveAdStudioPlan({ organizationId: orgId, projectId, briefId: brief.id, plan: { ...PLAN, summary: 'Second run' }, sources: SOURCES, generatedBy });
    expect(await getAdStudioBrief(orgId, projectId, brief.id)).toMatchObject({ status: 'scripted', plan: { summary: 'Second run' } });
  });
});
