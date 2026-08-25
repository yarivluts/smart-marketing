export class MetaAdsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MetaAdsApiError';
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

/** An ad set's own live daily budget (USD cents, if the ad set has one — see `MetaAutomationActionExecutor`'s own doc comment for why an ad set created by this connector starts with no independent budget) and status, as reported by Meta. */
export interface MetaGetAdSetResult {
  adSetId: string;
  dailyBudgetCents?: number;
  status: MetaObjectStatus;
}

/** At least one of `dailyBudgetCents`/`status` should be set — an empty edit is a caller bug, though this client itself doesn't enforce that (see `MetaAutomationActionExecutor.executeMetaAdSetEdit`, which never calls `updateAdSet` with an empty params object). */
export interface MetaUpdateAdSetParams {
  dailyBudgetCents?: number;
  status?: MetaObjectStatus;
}

export interface MetaCreateAdCreativeParams {
  /** The Facebook Page this link ad posts as — required by Meta's `object_story_spec.page_id`. */
  pageId: string;
  primaryText: string;
  headline: string;
  description?: string;
  linkUrl: string;
}

export interface MetaCreateAdCreativeResult {
  creativeId: string;
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

/**
 * One contact's already-hashed Custom Audience match key(s) — `emailHash`
 * and/or `phoneHash`, matching Meta's own multi-key `users` upload schema
 * (a row can carry either or both; Meta improves match rate when both are
 * present for the same person). `MetaCustomAudienceSinkPluginExecutor`
 * builds these; this client never receives a raw email or phone number.
 */
export interface MetaContactMatchKey {
  emailHash?: string;
  phoneHash?: string;
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
  /** Creates a link-ad creative (`object_story_spec`: page id, message, link, headline/name, description). */
  createAdCreative(adAccountId: string, params: MetaCreateAdCreativeParams): Promise<MetaCreateAdCreativeResult>;
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
   * Reads an ad set's own live daily budget/status (KAN-73 follow-up:
   * post-creation ad-set edits) — `MetaAutomationActionExecutor.executeMetaAdSetEdit`
   * calls this immediately before applying an edit, since `AutomationTargetStateModel`
   * has no per-ad-set field to source the pre-edit values from the way
   * `campaign_budget_resource_name`/`campaign_status` do for a whole
   * campaign (see `AutomationMetaAdSetEditExecutionInput`'s own doc
   * comment). Throws `MetaAdsApiError` if `adSetId` doesn't resolve to a
   * real ad set.
   */
  getAdSet(adSetId: string): Promise<MetaGetAdSetResult>;
  /**
   * Updates an already-created ad set's daily budget (USD cents) and/or
   * status in a single field-POST (KAN-73 follow-up) — mirrors
   * `setDailyBudgetCents`/`setObjectStatus` (both of which already work
   * against any object id, ad sets included, since Meta's Graph API POST
   * endpoint is generic over object type), but bundles both possible fields
   * into one request rather than two separate round trips when an edit
   * touches both at once.
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
}

const META_API_VERSION = 'v21.0';
const META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/** Meta's real ad-set `targeting.genders` field is numeric: 1 = male, 2 = female. Omitted entirely means "all genders." */
const GENDER_CODES: Record<'male' | 'female', number> = { male: 1, female: 2 };

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
    const targetingSpec: Record<string, unknown> = {
      geo_locations: { countries: params.targeting.countries },
      age_min: params.targeting.ageMin,
      age_max: params.targeting.ageMax,
    };
    if (params.targeting.genders && params.targeting.genders.length > 0) {
      targetingSpec.genders = params.targeting.genders.map((gender) => GENDER_CODES[gender]);
    }
    const result = await this.request<{ id: string }>(`act_${adAccountId}/adsets`, {
      name: params.name,
      campaign_id: params.campaignId,
      status: 'PAUSED',
      targeting: JSON.stringify(targetingSpec),
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
      },
    };
    const result = await this.request<{ id: string }>(`act_${adAccountId}/adcreatives`, {
      name: params.headline,
      object_story_spec: JSON.stringify(objectStorySpec),
    });
    return { creativeId: result.id };
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

  async getAdSet(adSetId: string): Promise<MetaGetAdSetResult> {
    const result = await this.getRequest<{ id: string; daily_budget?: string; status: MetaObjectStatus }>(adSetId, {
      fields: 'id,daily_budget,status',
    });
    return {
      adSetId: result.id,
      ...(result.daily_budget !== undefined ? { dailyBudgetCents: Number(result.daily_budget) } : {}),
      status: result.status,
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
    // whole payload — include EMAIL/PHONE only if at least one contact in
    // this call actually carries it (keeps a phone-less call's payload
    // byte-identical to the pre-phone-support `{schema: ['EMAIL'], ...}`
    // shape), and fill a missing key with `''` per row per Meta's own spec.
    const schema: Array<'EMAIL' | 'PHONE'> = [];
    if (contacts.some((contact) => contact.emailHash !== undefined)) {
      schema.push('EMAIL');
    }
    if (contacts.some((contact) => contact.phoneHash !== undefined)) {
      schema.push('PHONE');
    }
    const data = contacts.map((contact) => schema.map((key) => (key === 'EMAIL' ? (contact.emailHash ?? '') : (contact.phoneHash ?? ''))));

    const result = await this.request<{ num_received?: number }>(`${audienceId}/users`, {
      payload: JSON.stringify({ schema, data }),
    });
    return { numReceived: result.num_received ?? contacts.length };
  }
}

export { usdToCents };
