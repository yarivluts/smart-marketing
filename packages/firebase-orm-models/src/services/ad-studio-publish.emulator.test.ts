import 'reflect-metadata';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  listAdStudioExports,
  LocalKmsProvider,
  MetaAdsApiError,
  publishAdStudioAd,
  pushResourceAttachment,
  setResourceAttachmentWriteTier,
  setSharedCredentialSecret,
  type GoogleAdsApiClient,
  type MetaAdsApiClient,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-publish-tests');
});

const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
const kms = new LocalKmsProvider(keyRing, currentKeyId);
const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;
const IMG = new Uint8Array([1, 2, 3]);
const COPY = { headline: 'Sign in 30 seconds', primaryText: 'Legally binding e-signatures for lawyers', description: 'Try it free', linkUrl: 'https://easysign.example', businessName: 'EasySign' };

async function setup(provider: 'meta_ads' | 'google_ads', secret: unknown) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('o')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Publish Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const credential = await createSharedCredential({ organizationId: organization.id, name: provider, provider, availableScopes: ['ads'], createdByUserId: owner.id });
  await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: JSON.stringify(secret), kms, actorId: owner.id });
  const attachment = await pushResourceAttachment({ organizationId: organization.id, projectId: project.id, resourceKind: 'credential', resourceId: credential.id, pushedByUserId: owner.id, scopeSelection: ['ads'] });
  await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: attachment.id, tier: 'manage', actorId: owner.id });
  return { owner, orgId: organization.id, projectId: project.id };
}

function fakeMeta() {
  return {
    createCampaign: vi.fn(async () => ({ campaignId: 'c1' })),
    createAdSet: vi.fn(async () => ({ adSetId: 's1' })),
    uploadAdImage: vi.fn(async () => ({ imageHash: 'h1' })),
    createAdCreative: vi.fn(async () => ({ creativeId: 'cr1' })),
    createVideoAdCreative: vi.fn(async () => ({ creativeId: 'cr2' })),
    createAd: vi.fn(async () => ({ adId: 'a1' })),
  } as unknown as MetaAdsApiClient & Record<string, ReturnType<typeof vi.fn>>;
}

describe('publishAdStudioAd', () => {
  it('creates a paused Meta image ad (campaign, ad set, image, creative, ad) and records the link', async () => {
    const ctx = await setup('meta_ads', { accessToken: 't', adAccountId: '1646897415410557', pageId: 'p1' });
    const meta = fakeMeta();
    const row = await publishAdStudioAd({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: 'b1',
      destination: 'meta',
      media: { kind: 'image', imageId: 'i1', primary: IMG, square: null, landscape: null },
      copy: COPY,
      campaignName: 'Sign fast - square',
      dailyBudget: 20,
      countries: ['IL'],
      kms,
      actorId: ctx.owner.id,
      clients: { meta: () => meta },
    });
    expect(row).toMatchObject({ status: 'done', result_kind: 'ad', media_kind: 'image', external_id: 'a1' });
    expect(row.external_url).toBe('https://adsmanager.facebook.com/adsmanager/manage/ads?act=1646897415410557&selected_campaign_ids=c1&selected_ad_ids=a1');
    expect(meta.createCampaign).toHaveBeenCalledWith('1646897415410557', { name: 'Sign fast - square', objective: 'OUTCOME_TRAFFIC', dailyBudgetCents: 2000 });
    expect(meta.createAdCreative).toHaveBeenCalledWith('1646897415410557', expect.objectContaining({ pageId: 'p1', imageHash: 'h1', linkUrl: 'https://easysign.example' }));
    expect((await listAdStudioExports(ctx.orgId, ctx.projectId, 'b1'))[0].platform_refs).toMatchObject({ campaign_id: 'c1', ad_set_id: 's1', ad_id: 'a1' });
  });

  it('creates a paused Meta video ad with a thumbnail', async () => {
    const ctx = await setup('meta_ads', { accessToken: 't', adAccountId: '99', pageId: 'p1' });
    const meta = fakeMeta();
    const uploadVideo = vi.fn(async () => ({ videoId: 'v9', url: 'x' }));
    const row = await publishAdStudioAd({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: 'b1',
      destination: 'meta',
      media: { kind: 'video', videoId: 'vid', video: IMG, thumbnail: IMG },
      copy: COPY,
      campaignName: 'Sign fast - video',
      dailyBudget: 20,
      countries: ['IL', 'US'],
      kms,
      actorId: ctx.owner.id,
      clients: { meta: () => meta, uploadVideo },
    });
    expect(row.status).toBe('done');
    expect(meta.createVideoAdCreative).toHaveBeenCalledWith('99', expect.objectContaining({ videoId: 'v9', imageHash: 'h1' }));
  });

  it('creates a paused Google Display ad from 1.91:1 and square images, with the declaration as given', async () => {
    const ctx = await setup('google_ads', { developerToken: 'd', clientId: 'c', clientSecret: 's', refreshToken: 'r', customerId: '4816235600' });
    const google = {
      uploadImageAsset: vi.fn(async (_c: string, p: { name: string }) => ({ assetResourceName: `customers/4816235600/assets/${p.name.endsWith('landscape') ? 1 : 2}` })),
      createDisplayAdCampaign: vi.fn(async () => ({
        campaignBudgetResourceName: 'customers/4816235600/campaignBudgets/7',
        campaignResourceName: 'customers/4816235600/campaigns/55',
        adGroupResourceName: 'customers/4816235600/adGroups/66',
        adResourceName: 'customers/4816235600/adGroupAds/66~77',
      })),
    } as unknown as GoogleAdsApiClient;
    const row = await publishAdStudioAd({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: 'b1',
      destination: 'google_ads',
      media: { kind: 'image', imageId: 'i1', primary: IMG, square: IMG, landscape: IMG },
      copy: COPY,
      campaignName: 'Sign fast - display',
      dailyBudget: 30,
      countries: [],
      containsEuPoliticalAdvertising: false,
      kms,
      actorId: ctx.owner.id,
      clients: { google: () => google },
    });
    expect(row).toMatchObject({ status: 'done', external_url: 'https://ads.google.com/aw/ads?campaignId=55&adId=77&__e=4816235600' });
    expect((google as unknown as { createDisplayAdCampaign: ReturnType<typeof vi.fn> }).createDisplayAdCampaign).toHaveBeenCalledWith(
      '4816235600',
      expect.objectContaining({ containsEuPoliticalAdvertising: false, marketingImageAssets: ['customers/4816235600/assets/1'], squareImageAssets: ['customers/4816235600/assets/2'], businessName: 'EasySign', dailyBudgetMicros: 30_000_000 }),
    );
  });

  it('creates a paused Google Search campaign from the search ad, its keywords and negatives, where they were researched', async () => {
    const ctx = await setup('google_ads', { developerToken: 'd', clientId: 'c', clientSecret: 's', refreshToken: 'r', customerId: '4816235600' });
    const google = {
      createSearchAdCampaign: vi.fn(async () => ({
        campaignBudgetResourceName: 'customers/4816235600/campaignBudgets/8',
        campaignResourceName: 'customers/4816235600/campaigns/56',
        adGroupResourceName: 'customers/4816235600/adGroups/67',
        adResourceName: 'customers/4816235600/adGroupAds/67~78',
      })),
    } as unknown as GoogleAdsApiClient & { createSearchAdCampaign: ReturnType<typeof vi.fn> };
    const ad = { headlines: ['Sign in seconds', 'E-signatures for lawyers', 'Start free'], descriptions: ['Upload, send, signed.', 'Legally binding.'], path1: 'sign', path2: '' };
    const keywords = [
      { text: 'electronic signature', matchType: 'PHRASE' as const, avgMonthlySearches: 12100, competition: 'HIGH' as const, lowTopOfPageBid: 2, highTopOfPageBid: 9 },
      { text: 'sign pdf', matchType: 'EXACT' as const, avgMonthlySearches: 880, competition: 'LOW' as const, lowTopOfPageBid: 1, highTopOfPageBid: 3 },
    ];
    const row = await publishAdStudioAd({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: 'b1',
      destination: 'google_ads',
      media: { kind: 'search', ad, keywords, negatives: ['free'], targeting: { country: 'IL', language: 'he' } },
      // The feed copy is not used by a search ad: only the link is.
      copy: { headline: '', primaryText: '', description: '', linkUrl: 'https://easysign.example', businessName: '' },
      campaignName: 'Sign fast - search',
      dailyBudget: 50,
      countries: [],
      containsEuPoliticalAdvertising: false,
      kms,
      actorId: ctx.owner.id,
      clients: { google: () => google },
    });
    expect(row).toMatchObject({ status: 'done', media_kind: 'search', description: 'Sign in seconds', external_url: 'https://ads.google.com/aw/ads?campaignId=56&__e=4816235600' });
    expect(google.createSearchAdCampaign).toHaveBeenCalledWith('4816235600', {
      name: 'Sign fast - search',
      dailyBudgetMicros: 50_000_000,
      // The middle of the keywords' top-of-page bids (3 and 9).
      cpcBidMicros: 6_000_000,
      containsEuPoliticalAdvertising: false,
      headlines: ad.headlines,
      descriptions: ad.descriptions,
      path1: 'sign',
      path2: '',
      finalUrl: 'https://easysign.example',
      keywords: [
        { text: 'electronic signature', matchType: 'PHRASE' },
        { text: 'sign pdf', matchType: 'EXACT' },
      ],
      negativeKeywords: ['free'],
      geoTargetConstants: ['geoTargetConstants/2376'],
      languageConstants: ['languageConstants/1027'],
    });
  });

  it('refuses a search ad on Meta, without keywords, or breaking Google limits - before calling anything', async () => {
    const ctx = await setup('google_ads', { developerToken: 'd', clientId: 'c', clientSecret: 's', refreshToken: 'r', customerId: '1' });
    const ad = { headlines: ['A', 'B'], descriptions: ['x', 'y'], path1: '', path2: '' };
    const base = {
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: 'b1',
      copy: { ...COPY, headline: '', primaryText: '' },
      campaignName: 'Search',
      dailyBudget: 20,
      countries: [],
      kms,
      actorId: ctx.owner.id,
    };
    await expect(
      publishAdStudioAd({ ...base, destination: 'google_ads', media: { kind: 'search', ad, keywords: [], negatives: [], targeting: { country: 'IL', language: 'he' } } }),
    ).rejects.toMatchObject({
      reasons: ['choose at least one keyword', 'the search ad breaks Google limits - fix it in the Review step', 'answer whether the campaign contains EU political advertising'],
    });
    await expect(
      publishAdStudioAd({ ...base, destination: 'meta', countries: ['IL'], media: { kind: 'search', ad: { ...ad, headlines: ['A', 'B', 'C'] }, keywords: [{ text: 'k', matchType: 'EXACT', avgMonthlySearches: null, competition: null, lowTopOfPageBid: null, highTopOfPageBid: null }], negatives: [], targeting: { country: 'IL', language: 'he' } } }),
    ).rejects.toMatchObject({ reasons: ['a search ad runs on Google Ads'] });
    expect(await listAdStudioExports(ctx.orgId, ctx.projectId, 'b1')).toEqual([]);
  });

  it('deletes the Meta campaign it created when a later step fails, and records the failure', async () => {
    const ctx = await setup('meta_ads', { accessToken: 't', adAccountId: '99', pageId: 'p1' });
    const meta = fakeMeta();
    (meta as unknown as { createAdCreative: ReturnType<typeof vi.fn> }).createAdCreative.mockRejectedValue(new Error('creative refused'));
    const setObjectStatus = vi.fn(async () => undefined);
    Object.assign(meta, { setObjectStatus });
    const row = await publishAdStudioAd({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: 'b1',
      destination: 'meta',
      media: { kind: 'image', imageId: 'i1', primary: IMG, square: null, landscape: null },
      copy: COPY,
      campaignName: 'Sign fast - square',
      dailyBudget: 20,
      countries: ['IL'],
      kms,
      actorId: ctx.owner.id,
      clients: { meta: () => meta },
    });
    expect(row.status).toBe('failed');
    expect(setObjectStatus).toHaveBeenCalledWith('c1', 'DELETED');
  });

  it('records what Meta said when the account is behind a security check, with a code the Publish step explains', async () => {
    const ctx = await setup('meta_ads', { accessToken: 't', adAccountId: '99', pageId: 'p1' });
    const meta = fakeMeta();
    const body = JSON.stringify({ error: { message: 'This request requires the user to take a pending action', code: 31, error_subcode: 3858385, error_user_title: 'Verify your account', error_user_msg: 'Verify the account in Ads Manager to keep creating ads.' } });
    (meta as unknown as { createAd: ReturnType<typeof vi.fn> }).createAd.mockRejectedValue(new MetaAdsApiError(`Meta answered a create without an id: ${body}`, 200));
    Object.assign(meta, { setObjectStatus: vi.fn(async () => undefined) });
    const row = await publishAdStudioAd({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: 'b1',
      destination: 'meta',
      media: { kind: 'image', imageId: 'i1', primary: IMG, square: null, landscape: null },
      copy: COPY,
      campaignName: 'Sign fast',
      dailyBudget: 20,
      countries: ['IL'],
      kms,
      actorId: ctx.owner.id,
      clients: { meta: () => meta },
    });
    expect(row).toMatchObject({ status: 'failed', failure_code: 'account_action_required', failure_detail: 'Verify your account - Verify the account in Ads Manager to keep creating ads.' });
  });

  it('refuses a Google ad without the EU declaration, a Google video, and an unconnected destination', async () => {
    const ctx = await setup('google_ads', { developerToken: 'd', clientId: 'c', clientSecret: 's', refreshToken: 'r', customerId: '1' });
    const base = { organizationId: ctx.orgId, projectId: ctx.projectId, briefId: 'b1', copy: COPY, campaignName: 'x', dailyBudget: 10, countries: ['IL'], kms, actorId: ctx.owner.id };
    await expect(publishAdStudioAd({ ...base, destination: 'google_ads', media: { kind: 'image', imageId: 'i', primary: IMG, square: IMG, landscape: IMG } })).rejects.toMatchObject({
      name: 'AdStudioExportInvalidError',
    });
    await expect(publishAdStudioAd({ ...base, destination: 'google_ads', containsEuPoliticalAdvertising: false, media: { kind: 'video', videoId: 'v', video: IMG, thumbnail: IMG } })).rejects.toMatchObject({
      name: 'AdStudioExportInvalidError',
    });
    await expect(publishAdStudioAd({ ...base, destination: 'meta', media: { kind: 'image', imageId: 'i', primary: IMG, square: null, landscape: null } })).rejects.toMatchObject({
      name: 'AdStudioExportUnavailableError',
      reason: 'not_attached',
    });
  });
});
