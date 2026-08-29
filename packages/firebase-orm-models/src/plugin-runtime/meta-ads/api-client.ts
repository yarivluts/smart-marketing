export class MetaAdsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MetaAdsApiError';
  }
}

/** `POST /act_{id}/adimages` returned a 2xx response but its `images` object was empty — Meta's own documented shape for the call always keys the uploaded image by filename, so an empty object means the upload silently didn't take (a malformed `bytes` payload, most likely), not a network/auth failure `MetaAdsApiError` already covers. */
export class MetaAdsImageUploadFailedError extends Error {
  constructor() {
    super('Meta ad image upload returned no image hash.');
    this.name = 'MetaAdsImageUploadFailedError';
  }
}

/** Meta's own campaign/ad-set/ad `status` vocabulary — `DELETED` is the closest analog to Google Ads' `REMOVED` (Meta has no hard delete either), used by `MetaAutomationActionExecutor.rollbackCampaignDraftCreate`. */
export type MetaObjectStatus = 'ACTIVE' | 'PAUSED' | 'DELETED';

export interface MetaAdsApiClientOptions {
  /** A static long-lived access token (System User token or long-lived User token) — Meta's own auth model for a server-to-server Marketing API integration has no refresh-token dance to build, unlike Google Ads' OAuth2 flow. */
  accessToken: string;
}

export interface MetaCreateCampaignParams {
  name: string;
  objective: string;
  /** Campaign-level daily budget, in USD cents — see `MetaAutomationActionExecutor`'s own doc comment for why this connector uses a campaign-level (Advantage Campaign Budget-style) budget rather than an ad-set-level one. */
  dailyBudgetCents: number;
}

export interface MetaCreateCampaignResult {
  campaignId: string;
}

export interface MetaAdSetTargeting {
  /** ISO-3166 alpha-2 country codes. */
  countries: string[];
  ageMin: number;
  ageMax: number;
  genders?: Array<'male' | 'female'>;
}

export interface MetaCreateAdSetParams {
  campaignId: string;
  name: string;
  targeting: MetaAdSetTargeting;
}

export interface MetaCreateAdSetResult {
  adSetId: string;
}

/** An ad set's own live daily budget (USD cents, if the ad set has one — see `MetaAutomationActionExecutor`'s own doc comment for why an ad set created by this connector starts with no independent budget), status, and targeting spec (KAN-73 follow-up: ad-set targeting-spec edits), as reported by Meta. */
export interface MetaGetAdSetResult {
  adSetId: string;
  dailyBudgetCents?: number;
  status: MetaObjectStatus;
  targeting: MetaAdSetTargeting;
}

/** At least one of `dailyBudgetCents`/`status`/`targeting` should be set — an empty edit is a caller bug, though this client itself doesn't enforce that (see `MetaAutomationActionExecutor.executeMetaAdSetEdit`/`executeMetaAdSetTargetingEdit`, neither of which ever calls `updateAdSet` with an empty params object). Unlike `dailyBudgetCents`/`status`, `targeting` is always replaced as a whole object when present — Meta's own `targeting` field has no independently-patchable sub-fields, mirroring `MetaCreateAdSetParams.targeting`'s own all-or-nothing shape. */
export interface MetaUpdateAdSetParams {
  dailyBudgetCents?: number;
  status?: MetaObjectStatus;
  targeting?: MetaAdSetTargeting;
}

export interface MetaCreateAdCreativeParams {
  /** The Facebook Page this link ad posts as — required by Meta's `object_story_spec.page_id`. */
  pageId: string;
  primaryText: string;
  headline: string;
  description?: string;
  linkUrl: string;
  /** A hash returned by {@link MetaAdsApiClient.uploadAdImage} — referenced via `object_story_spec.link_data.image_hash`. Omitted entirely for a text-only link ad (the pre-existing behavior). */
  imageHash?: string;
}

export interface MetaCreateAdCreativeResult {
  creativeId: string;
}

export interface MetaUploadAdImageParams {
  /** Raw image bytes, base64-encoded (no `data:image/...;base64,` prefix). */
  base64Bytes: string;
}

export interface MetaUploadAdImageResult {
  imageHash: string;
}

export interface MetaCreateAdParams {
  adSetId: string;
  creativeId: string;
  name: string;
}

export interface MetaCreateAdResult {
  adId: string;
}

/** An ad's own live creative reference, as reported by Meta (KAN-73 follow-up: real Meta post-creation creative edit). */
export interface MetaGetAdResult {
  adId: string;
  creativeId: string;
}

/** A campaign's own live status + daily budget as Meta reports them (the `readCampaignState` seam, KAN-43 groundwork) — `dailyBudgetCents` is `null` for a campaign with no campaign-level budget (its ad sets carry their own instead). */
export interface MetaCampaignStateResult {
  campaignId: string;
  status: MetaObjectStatus;
  dailyBudgetCents: number | null;
}

export interface MetaUpdateAdParams {
  creativeId: string;
}

export interface MetaCreateCustomAudienceParams {
  name: string;
}

export interface MetaCreateCustomAudienceResult {
  audienceId: string;
}

/** How many of an `addContactsToCustomAudience` call's contact rows Meta actually accepted onto the audience — mirrors `SinkPluginPushResult.pushed`'s own "how many did the remote system actually take" semantics for the KAN-73-follow-up Custom Audience connector. */
export interface MetaAddHashedEmailsResult {
  numReceived: number;
}

export interface MetaCreateLookalikeAudienceParams {
  name: string;
  /** The already-created Custom Audience id this Lookalike is expanded from — Meta requires the origin audience to already have members before a Lookalike can be built from it. */
  originAudienceId: string;
  /** ISO-3166 alpha-2 country code — Meta's own Lookalike Audience API targets exactly one country per audience. */
  country: string;
  /** Similarity ratio, 0.01-0.20 (1%-20% of the target country's population) — Meta's own documented range and increment for `lookalike_spec.ratio`. */
  ratio: number;
}

export interface MetaCreateLookalikeAudienceResult {
  audienceId: string;
}

/**
 * One contact's already-hashed Custom Audience match key(s) — `emailHash`,
 * `phoneHash`, `madidHash` (mobile advertiser id), and/or the mailing-address
 * fields `firstNameHash`/`lastNameHash`/`cityHash`/`stateHash`/`zipHash`/
 * `countryHash`, matching Meta's own multi-key `users` upload schema (a row
 * can carry any combination; Meta improves match rate when more than one is
 * present for the same person). `MetaCustomAudienceSinkPluginExecutor`
 * builds these; this client never receives a raw email, phone number,
 * device id, or address field.
 */
export interface MetaContactMatchKey {
  emailHash?: string;
  phoneHash?: string;
  madidHash?: string;
  firstNameHash?: string;
  lastNameHash?: string;
  cityHash?: string;
  stateHash?: string;
  zipHash?: string;
  countryHash?: string;
}

/**
 * The Meta Graph Marketing API (v21.0) calls this connector needs, kept as a
 * small interface — not the `facebook-nodejs-business-sdk` npm SDK — so a
 * run's own executor can be driven by a fake client in tests without any
 * network access, the same "buildable-today, swap the provider later" seam
 * `GoogleAdsApiClient`/`StripeApiClient`/`WarehouseQueryExecutor` already
 * established for their own external-system boundaries. Deliberately more
 * granular than `GoogleAdsApiClient` (one method per object type rather than
 * one `createCampaignDraft` that internally sequences everything) — the
 * orchestration across a campaign's ad sets/creatives/ads lives in
 * `MetaAutomationActionExecutor` instead, since it's the layer that already
 * needs to see (and persist) every created resource id.
 */
export interface MetaAdsApiClient {
  /** Creates a paused campaign. */
  createCampaign(adAccountId: string, params: MetaCreateCampaignParams): Promise<MetaCreateCampaignResult>;
  /** Creates a paused ad set (targeting spec) under a campaign. */
  createAdSet(adAccountId: string, params: MetaCreateAdSetParams): Promise<MetaCreateAdSetResult>;
  /** Creates a link-ad creative (`object_story_spec`: page id, message, link, headline/name, description, optional image hash). */
  createAdCreative(adAccountId: string, params: MetaCreateAdCreativeParams): Promise<MetaCreateAdCreativeResult>;
  /**
   * Uploads a creative image and returns the hash `createAdCreative`
   * references via `image_hash`. Real Meta image upload (KAN-73 follow-up) —
   * `bytes` (base64) rides a normal form POST, same as every other mutating
   * call this client makes; no multipart/form-data upload is needed. Throws
   * {@link MetaAdsImageUploadFailedError} if the response carries no image.
   */
  uploadAdImage(adAccountId: string, params: MetaUploadAdImageParams): Promise<MetaUploadAdImageResult>;
  /** Creates a paused ad referencing an already-created creative. */
  createAd(adAccountId: string, params: MetaCreateAdParams): Promise<MetaCreateAdResult>;
  /**
   * Reads an ad's own live creative reference (KAN-73 follow-up: real Meta
   * post-creation creative edit) —
   * `MetaAutomationActionExecutor.executeMetaAdCreativeEdit` calls this
   * immediately before applying an edit, since `AutomationTargetStateModel`
   * has no per-ad field to source the pre-edit creative from, the same
   * "isn't known until execute time" reasoning `getAdSet` establishes for
   * `meta_ad_set_edit`. Throws `MetaAdsApiError` if `adId` doesn't resolve
   * to a real ad.
   */
  getAd(adId: string): Promise<MetaGetAdResult>;
  /**
   * Repoints an already-created ad at a different (also already-created)
   * creative (KAN-73 follow-up) — unlike Google Ads' `Ad` resource, a Meta
   * `Ad`'s own `creative` reference is mutable in place via a normal
   * field-POST, even though the `AdCreative` object it points at is not (see
   * `AutomationMetaAdCreativeEditExecutionInput`'s own doc comment).
   */
  updateAd(adId: string, params: MetaUpdateAdParams): Promise<void>;
  /** Updates a campaign's own daily budget (USD cents) — mirrors `GoogleAdsApiClient.setCampaignBudgetAmount`, except the "budget resource" here just is the campaign object itself. */
  setDailyBudgetCents(campaignId: string, dailyBudgetCents: number): Promise<void>;
  /** Sets any object's (campaign/ad set/ad) status — covers both `campaign_activation` (`ACTIVE`/`PAUSED`) and a creation rollback (`DELETED`). */
  setObjectStatus(objectId: string, status: MetaObjectStatus): Promise<void>;
  /**
   * Confirms a campaign id refers to a real campaign — used by
   * `MetaAutomationActionExecutor` for a `budget_change` action against a
   * target seeded to represent a pre-existing campaign this plugin didn't
   * create (so `campaign_budget_resource_name` was never recorded; Meta has
   * no separate budget resource — see `MetaAutomationActionExecutor`'s own
   * doc comment). Throws `MetaAdsApiError` if `campaignId` doesn't resolve
   * to a real campaign.
   */
  getCampaign(campaignId: string): Promise<{ campaignId: string }>;
  /**
   * Reads a campaign's own live status + daily budget (the
   * `readCampaignState` seam, KAN-43 groundwork) — the campaign-level sibling
   * of {@link getAdSet}'s own live read, kept separate from
   * {@link getCampaign} (a pure existence check whose narrow result shape
   * `budget_change` execution already depends on). Throws `MetaAdsApiError`
   * if `campaignId` doesn't resolve to a real campaign.
   */
  getCampaignState(campaignId: string): Promise<MetaCampaignStateResult>;
  /**
   * Reads an ad set's own live daily budget/status/targeting spec (KAN-73
   * follow-up: post-creation ad-set edits, and the later "ad-set
   * targeting-spec edits" follow-up) —
   * `MetaAutomationActionExecutor.executeMetaAdSetEdit`/`executeMetaAdSetTargetingEdit`
   * call this immediately before applying an edit, since `AutomationTargetStateModel`
   * has no per-ad-set field to source the pre-edit values from the way
   * `campaign_budget_resource_name`/`campaign_status` do for a whole
   * campaign (see `AutomationMetaAdSetEditExecutionInput`'s own doc
   * comment). Throws `MetaAdsApiError` if `adSetId` doesn't resolve to a
   * real ad set.
   */
  getAdSet(adSetId: string): Promise<MetaGetAdSetResult>;
  /**
   * Updates an already-created ad set's daily budget (USD cents), status,
   * and/or targeting spec in a single field-POST (KAN-73 follow-up, the
   * targeting-spec parameter added by a later follow-up) — mirrors
   * `setDailyBudgetCents`/`setObjectStatus` (both of which already work
   * against any object id, ad sets included, since Meta's Graph API POST
   * endpoint is generic over object type), but bundles every possible field
   * into one request rather than separate round trips when an edit touches
   * more than one at once.
   */
  updateAdSet(adSetId: string, params: MetaUpdateAdSetParams): Promise<void>;
  /**
   * Creates a `CUSTOM`-subtype, user-provided-data Custom Audience on the ad
   * account (KAN-73 follow-up — see `plugin-runtime/meta-custom-audience`'s
   * own doc comment). Starts empty; `addContactsToCustomAudience`
   * populates it.
   */
  createCustomAudience(adAccountId: string, params: MetaCreateCustomAudienceParams): Promise<MetaCreateCustomAudienceResult>;
  /**
   * Adds already-hashed contact match keys to an existing Custom Audience —
   * the caller (`MetaCustomAudienceSinkPluginExecutor`) hashes every email/
   * phone before this call ever sees it; this client never receives a raw
   * email address or phone number.
   */
  addContactsToCustomAudience(audienceId: string, contacts: readonly MetaContactMatchKey[]): Promise<MetaAddHashedEmailsResult>;
  /**
   * Creates a `LOOKALIKE`-subtype Custom Audience seeded from an already-created
   * Custom Audience (KAN-73 follow-up — see `meta-lookalike-audience.model.ts`'s
   * own doc comment). Meta expands `originAudienceId`'s membership into a new
   * audience of similar people within `country`, sized by `ratio`.
   */
  createLookalikeAudience(adAccountId: string, params: MetaCreateLookalikeAudienceParams): Promise<MetaCreateLookalikeAudienceResult>;
}

const META_API_VERSION = 'v21.0';
const META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/** Meta's real ad-set `targeting.genders` field is numeric: 1 = male, 2 = female. Omitted entirely means "all genders." */
const GENDER_CODES: Record<'male' | 'female', number> = { male: 1, female: 2 };
/** The reverse of {@link GENDER_CODES} — used by `getAdSet` to parse a live targeting spec back into {@link MetaAdSetTargeting}'s own vocabulary. */
const GENDER_CODES_REVERSE: Record<number, 'male' | 'female'> = { 1: 'male', 2: 'female' };

/**
 * Builds Meta's own `targeting` JSON shape (`geo_locations`/`age_min`/
 * `age_max`/optional numeric `genders`) from {@link MetaAdSetTargeting} —
 * shared by `createAdSet` (a brand-new ad set) and `updateAdSet` (KAN-73
 * follow-up: ad-set targeting-spec edits, an already-created one) so the two
 * never drift.
 */
function buildMetaTargetingSpec(targeting: MetaAdSetTargeting): Record<string, unknown> {
  const targetingSpec: Record<string, unknown> = {
    geo_locations: { countries: targeting.countries },
    age_min: targeting.ageMin,
    age_max: targeting.ageMax,
  };
  if (targeting.genders && targeting.genders.length > 0) {
    targetingSpec.genders = targeting.genders.map((gender) => GENDER_CODES[gender]);
  }
  return targetingSpec;
}

/**
 * Parses Meta's own live `targeting` JSON shape back into
 * {@link MetaAdSetTargeting} (KAN-73 follow-up: ad-set targeting-spec
 * edits) — the reverse of {@link buildMetaTargetingSpec}, used by `getAdSet`
 * to read an ad set's true pre-edit targeting. An empty/missing `genders`
 * array parses back to `undefined` ("all genders"), matching
 * {@link MetaAdSetTargeting.genders}'s own "omitted means all genders"
 * convention.
 */
function parseMetaTargetingSpec(raw: { geo_locations: { countries: string[] }; age_min: number; age_max: number; genders?: number[] }): MetaAdSetTargeting {
  const genders = (raw.genders ?? []).map((code) => GENDER_CODES_REVERSE[code]).filter((gender): gender is 'male' | 'female' => gender !== undefined);
  return {
    countries: raw.geo_locations.countries,
    ageMin: raw.age_min,
    ageMax: raw.age_max,
    ...(genders.length > 0 ? { genders } : {}),
  };
}

/** Meta requires USD cents (an integer), not fractional dollars — mirrors Google Ads' own `usdToMicros`. */
function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}

/**
 * The real Meta Graph Marketing API client — plain `fetch` against Meta's
 * documented REST endpoints (`https://graph.facebook.com/v21.0/act_{adAccountId}/...`),
 * no SDK dependency. This is the implementation `MetaAutomationActionExecutor`
 * uses by default in production; every automated test in this repo drives
 * the executor with a fake {@link MetaAdsApiClient} instead, since there is
 * no real Meta ad account reachable from CI (KAN-43's Marketing API review is
 * still outstanding) — the same "E2E on a real account is deferred" posture
 * `GoogleAdsHttpApiClient`'s own doc comment carries.
 *
 * Every mutating call here is a separate sequential Graph API request (create
 * campaign, then per ad set: create ad set -> create creative -> create ad)
 * rather than one atomic batched request — Meta's Graph API does support a
 * single `/` batch endpoint, but that adds real complexity (per-request
 * dependency references across the batch) this story's "buildable-today,
 * actually works" bar doesn't require; a partial failure here simply leaves
 * an incomplete but PAUSED draft rather than rolling back automatically —
 * the same acceptable gap `GoogleAdsHttpApiClient.createCampaignDraft`'s own
 * doc comment documents for a paused, not-yet-live campaign a human reviews
 * before activating.
 */
export class MetaAdsHttpApiClient implements MetaAdsApiClient {
  constructor(private readonly options: MetaAdsApiClientOptions) {}

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const body = new URLSearchParams({ ...params, access_token: this.options.accessToken });
    const response = await fetch(`${META_GRAPH_API_BASE_URL}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new MetaAdsApiError(`Meta Graph API request to ${path} failed with status ${response.status}: ${detail}`, response.status);
    }
    return (await response.json()) as T;
  }

  private async getRequest<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const query = new URLSearchParams({ ...params, access_token: this.options.accessToken });
    const response = await fetch(`${META_GRAPH_API_BASE_URL}/${path}?${query.toString()}`, { method: 'GET' });
    if (!response.ok) {
      const detail = await response.text();
      throw new MetaAdsApiError(`Meta Graph API request to ${path} failed with status ${response.status}: ${detail}`, response.status);
    }
    return (await response.json()) as T;
  }

  async createCampaign(adAccountId: string, params: MetaCreateCampaignParams): Promise<MetaCreateCampaignResult> {
    const result = await this.request<{ id: string }>(`act_${adAccountId}/campaigns`, {
      name: params.name,
      objective: params.objective,
      status: 'PAUSED',
      special_ad_categories: JSON.stringify([]),
      daily_budget: String(params.dailyBudgetCents),
    });
    return { campaignId: result.id };
  }

  async createAdSet(adAccountId: string, params: MetaCreateAdSetParams): Promise<MetaCreateAdSetResult> {
    const result = await this.request<{ id: string }>(`act_${adAccountId}/adsets`, {
      name: params.name,
      campaign_id: params.campaignId,
      status: 'PAUSED',
      targeting: JSON.stringify(buildMetaTargetingSpec(params.targeting)),
      // Fixed, documented simplification (this connector always builds a
      // link-click campaign) — mirrors `GoogleAdsHttpApiClient`'s own
      // `manualCpc: {}` placeholder for a bidding detail this story doesn't
      // need to make user-configurable yet.
      optimization_goal: 'LINK_CLICKS',
      billing_event: 'IMPRESSIONS',
    });
    return { adSetId: result.id };
  }

  async createAdCreative(adAccountId: string, params: MetaCreateAdCreativeParams): Promise<MetaCreateAdCreativeResult> {
    const objectStorySpec: Record<string, unknown> = {
      page_id: params.pageId,
      link_data: {
        message: params.primaryText,
        link: params.linkUrl,
        name: params.headline,
        ...(params.description ? { description: params.description } : {}),
        ...(params.imageHash ? { image_hash: params.imageHash } : {}),
      },
    };
    const result = await this.request<{ id: string }>(`act_${adAccountId}/adcreatives`, {
      name: params.headline,
      object_story_spec: JSON.stringify(objectStorySpec),
    });
    return { creativeId: result.id };
  }

  async uploadAdImage(adAccountId: string, params: MetaUploadAdImageParams): Promise<MetaUploadAdImageResult> {
    const result = await this.request<{ images: Record<string, { hash: string }> }>(`act_${adAccountId}/adimages`, {
      bytes: params.base64Bytes,
    });
    const uploaded = Object.values(result.images ?? {})[0];
    if (!uploaded?.hash) {
      throw new MetaAdsImageUploadFailedError();
    }
    return { imageHash: uploaded.hash };
  }

  async createAd(adAccountId: string, params: MetaCreateAdParams): Promise<MetaCreateAdResult> {
    const result = await this.request<{ id: string }>(`act_${adAccountId}/ads`, {
      name: params.name,
      adset_id: params.adSetId,
      status: 'PAUSED',
      creative: JSON.stringify({ creative_id: params.creativeId }),
    });
    return { adId: result.id };
  }

  async getAd(adId: string): Promise<MetaGetAdResult> {
    const result = await this.getRequest<{ id: string; creative: { id: string } }>(adId, { fields: 'id,creative' });
    return { adId: result.id, creativeId: result.creative.id };
  }

  async updateAd(adId: string, params: MetaUpdateAdParams): Promise<void> {
    await this.request<{ success?: boolean }>(adId, { creative: JSON.stringify({ creative_id: params.creativeId }) });
  }

  async setDailyBudgetCents(campaignId: string, dailyBudgetCents: number): Promise<void> {
    await this.request<{ success?: boolean }>(campaignId, { daily_budget: String(dailyBudgetCents) });
  }

  async setObjectStatus(objectId: string, status: MetaObjectStatus): Promise<void> {
    await this.request<{ success?: boolean }>(objectId, { status });
  }

  async getCampaign(campaignId: string): Promise<{ campaignId: string }> {
    const result = await this.getRequest<{ id: string }>(campaignId, { fields: 'id' });
    return { campaignId: result.id };
  }

  async getCampaignState(campaignId: string): Promise<MetaCampaignStateResult> {
    const result = await this.getRequest<{ id: string; status: MetaObjectStatus; daily_budget?: string }>(campaignId, {
      fields: 'id,status,daily_budget',
    });
    return {
      campaignId: result.id,
      status: result.status,
      dailyBudgetCents: result.daily_budget !== undefined ? Number(result.daily_budget) : null,
    };
  }

  async getAdSet(adSetId: string): Promise<MetaGetAdSetResult> {
    const result = await this.getRequest<{
      id: string;
      daily_budget?: string;
      status: MetaObjectStatus;
      targeting: { geo_locations: { countries: string[] }; age_min: number; age_max: number; genders?: number[] };
    }>(adSetId, {
      fields: 'id,daily_budget,status,targeting',
    });
    return {
      adSetId: result.id,
      ...(result.daily_budget !== undefined ? { dailyBudgetCents: Number(result.daily_budget) } : {}),
      status: result.status,
      targeting: parseMetaTargetingSpec(result.targeting),
    };
  }

  async updateAdSet(adSetId: string, params: MetaUpdateAdSetParams): Promise<void> {
    const body: Record<string, string> = {};
    if (params.dailyBudgetCents !== undefined) {
      body.daily_budget = String(params.dailyBudgetCents);
    }
    if (params.status !== undefined) {
      body.status = params.status;
    }
    if (params.targeting !== undefined) {
      body.targeting = JSON.stringify(buildMetaTargetingSpec(params.targeting));
    }
    await this.request<{ success?: boolean }>(adSetId, body);
  }

  async createCustomAudience(adAccountId: string, params: MetaCreateCustomAudienceParams): Promise<MetaCreateCustomAudienceResult> {
    const result = await this.request<{ id: string }>(`act_${adAccountId}/customaudiences`, {
      name: params.name,
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
    });
    return { audienceId: result.id };
  }

  async addContactsToCustomAudience(audienceId: string, contacts: readonly MetaContactMatchKey[]): Promise<MetaAddHashedEmailsResult> {
    // Meta's multi-key `users` upload schema is one fixed column list for the
    // whole payload — include a column only if at least one contact in this
    // call actually carries it (keeps a call missing a given identifier's
    // payload byte-identical to what it would have been before that
    // identifier was supported at all — e.g. a MADID-less call's payload is
    // byte-identical to the pre-MADID-support `{schema: ['EMAIL', 'PHONE'],
    // ...}` shape), and fill a missing key with `''` per row per Meta's own
    // spec.
    const schema: Array<'EMAIL' | 'PHONE' | 'MADID' | 'FN' | 'LN' | 'CT' | 'ST' | 'ZIP' | 'COUNTRY'> = [];
    if (contacts.some((contact) => contact.emailHash !== undefined)) {
      schema.push('EMAIL');
    }
    if (contacts.some((contact) => contact.phoneHash !== undefined)) {
      schema.push('PHONE');
    }
    if (contacts.some((contact) => contact.madidHash !== undefined)) {
      schema.push('MADID');
    }
    if (contacts.some((contact) => contact.firstNameHash !== undefined)) {
      schema.push('FN');
    }
    if (contacts.some((contact) => contact.lastNameHash !== undefined)) {
      schema.push('LN');
    }
    if (contacts.some((contact) => contact.cityHash !== undefined)) {
      schema.push('CT');
    }
    if (contacts.some((contact) => contact.stateHash !== undefined)) {
      schema.push('ST');
    }
    if (contacts.some((contact) => contact.zipHash !== undefined)) {
      schema.push('ZIP');
    }
    if (contacts.some((contact) => contact.countryHash !== undefined)) {
      schema.push('COUNTRY');
    }
    const columnValue: Record<'EMAIL' | 'PHONE' | 'MADID' | 'FN' | 'LN' | 'CT' | 'ST' | 'ZIP' | 'COUNTRY', (contact: MetaContactMatchKey) => string> = {
      EMAIL: (contact) => contact.emailHash ?? '',
      PHONE: (contact) => contact.phoneHash ?? '',
      MADID: (contact) => contact.madidHash ?? '',
      FN: (contact) => contact.firstNameHash ?? '',
      LN: (contact) => contact.lastNameHash ?? '',
      CT: (contact) => contact.cityHash ?? '',
      ST: (contact) => contact.stateHash ?? '',
      ZIP: (contact) => contact.zipHash ?? '',
      COUNTRY: (contact) => contact.countryHash ?? '',
    };
    const data = contacts.map((contact) => schema.map((key) => columnValue[key](contact)));

    const result = await this.request<{ num_received?: number }>(`${audienceId}/users`, {
      payload: JSON.stringify({ schema, data }),
    });
    return { numReceived: result.num_received ?? contacts.length };
  }

  async createLookalikeAudience(adAccountId: string, params: MetaCreateLookalikeAudienceParams): Promise<MetaCreateLookalikeAudienceResult> {
    const result = await this.request<{ id: string }>(`act_${adAccountId}/customaudiences`, {
      name: params.name,
      subtype: 'LOOKALIKE',
      origin_audience_id: params.originAudienceId,
      lookalike_spec: JSON.stringify({ type: 'similarity', country: params.country, ratio: params.ratio }),
    });
    return { audienceId: result.id };
  }
}

export { usdToCents };
