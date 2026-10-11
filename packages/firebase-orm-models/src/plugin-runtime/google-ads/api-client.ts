import type { CampaignDraftKeyword, GoogleAdsCampaignDraft } from '../../automation-runtime';

export class GoogleAdsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'GoogleAdsApiError';
  }
}

export type GoogleAdsCampaignStatus = 'PAUSED' | 'ENABLED' | 'REMOVED';

/** A campaign's own live status + daily budget as one GAQL read reports them (the `readCampaignState` seam, KAN-43 groundwork) — `dailyBudgetUsd` is `null` when the campaign row carries no readable budget amount. */
export interface GoogleAdsCampaignStateResult {
  status: GoogleAdsCampaignStatus;
  dailyBudgetUsd: number | null;
}

export interface GoogleAdsApiClientOptions {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** The manager (MCC) account id to send as `login-customer-id`, if the credential authenticates as a manager rather than directly as the target customer. */
  loginCustomerId?: string;
}

export interface GoogleAdsCreateCampaignDraftResult {
  campaignResourceName: string;
  campaignBudgetResourceName: string;
  adGroupResourceNames: string[];
  adResourceNames: string[];
}

export interface GoogleAdsCreateCustomerMatchUserListResult {
  userListResourceName: string;
}

export type GoogleAdsConsentStatus = 'GRANTED' | 'DENIED';

/**
 * The advertiser's consent for the uploaded users (KAN-236), sent at the offline user data job
 * level (`CustomerMatchUserListMetadata.consent`); Google needs it for users in the EEA. It is the
 * advertiser's own statement, so each part is sent only when the install's admin chose a value.
 */
export interface GoogleAdsCustomerMatchConsent {
  adUserData?: GoogleAdsConsentStatus;
  adPersonalization?: GoogleAdsConsentStatus;
}

/** A paused Display campaign carrying one responsive display ad (Ad Studio publishing). */
export interface GoogleAdsDisplayAdCampaignParams {
  name: string;
  /** Daily budget in the account's currency, in micros. */
  dailyBudgetMicros: number;
  /** Max CPC for the ad group, in micros. */
  cpcBidMicros: number;
  /** The advertiser's own EU political advertising self-declaration (required on every campaign). */
  containsEuPoliticalAdvertising: boolean;
  /** Image asset resource names: 1.91:1 marketing image(s) and 1:1 square image(s). */
  marketingImageAssets: string[];
  squareImageAssets: string[];
  headlines: string[];
  longHeadline: string;
  descriptions: string[];
  businessName: string;
  finalUrl: string;
}

export interface GoogleAdsSearchAdCampaignParams {
  name: string;
  /** Daily budget in the account's currency, in micros. */
  dailyBudgetMicros: number;
  /** Max CPC for the ad group, in micros. */
  cpcBidMicros: number;
  /** The advertiser's own EU political advertising self-declaration (required on every campaign). */
  containsEuPoliticalAdvertising: boolean;
  /** The responsive search ad: 3-15 headlines (30 characters), 2-4 descriptions (90). */
  headlines: string[];
  descriptions: string[];
  path1: string;
  path2: string;
  finalUrl: string;
  keywords: { text: string; matchType: 'BROAD' | 'PHRASE' | 'EXACT' }[];
  /** Searches that must not show the ad, added as phrase-match negatives on the ad group. */
  negativeKeywords: string[];
  /** `geoTargetConstants/...` resource names; empty targets every location. */
  geoTargetConstants: string[];
  /** `languageConstants/...` resource names; empty targets every language. */
  languageConstants: string[];
}

export interface GoogleAdsDisplayAdCampaignResult {
  campaignBudgetResourceName: string;
  campaignResourceName: string;
  adGroupResourceName: string;
  adResourceName: string;
}

export interface GoogleAdsAddCustomerMatchOperationsResult {
  /** The number of member operations submitted to the offline user data job — Google processes the job asynchronously, so this is "accepted", not "matched" (Google Ads has no synchronous match-count response, unlike Meta's `num_received`). */
  numReceived: number;
}

export interface GoogleAdsAddAdGroupKeywordsResult {
  keywordResourceNames: string[];
  negativeKeywordResourceNames: string[];
}

export interface GoogleAdsResponsiveSearchAdContent {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
}

export interface GoogleAdsCreateResponsiveSearchAdResult {
  adResourceName: string;
}

/**
 * One contact's Customer Match user identifier(s) — `hashedEmail` and/or
 * `hashedPhoneNumber` (both already SHA-256-hashed), `mobileId` (a mobile
 * advertiser id, deliberately NOT hashed — see `hashing.ts`'s own
 * `normalizeMobileIdForGoogleCustomerMatch` doc comment for why this one
 * field breaks the "already-hashed" pattern the other two establish), and/or
 * `addressInfo` (a mailing address — Google's real `UserIdentifier` proto
 * nests these under their own sub-object, unlike Meta's flat per-field
 * schema columns, see `addressInfo`'s own doc comment below), mirroring
 * `MetaContactMatchKey`'s shape for the sibling Meta connector. Any
 * combination, when present, rides the same `userIdentifiers` array on one
 * operation (Google's own docs: multiple identifiers on one `UserData`
 * improve match rate the same way Meta's multi-key schema does).
 */
export interface GoogleAdsContactMatchKey {
  hashedEmail?: string;
  hashedPhoneNumber?: string;
  mobileId?: string;
  addressInfo?: GoogleAdsAddressMatchInfo;
}

/**
 * A mailing address's own Customer Match identifier fields, matching
 * Google's real `OfflineUserAddressInfo` proto shape (`UserIdentifier.address_info`).
 * Only `hashedFirstName`/`hashedLastName` are hashed — `city`/`state`/
 * `countryCode`/`postalCode` are sent as cleartext, a genuine Google-side
 * difference from Meta's own `CT`/`ST`/`ZIP`/`COUNTRY` schema columns, which
 * hash every field (see `google-customer-match/hashing.ts`'s own
 * `hashNameForGoogleCustomerMatch` doc comment).
 */
export interface GoogleAdsAddressMatchInfo {
  hashedFirstName?: string;
  hashedLastName?: string;
  city?: string;
  state?: string;
  countryCode?: string;
  postalCode?: string;
}

/**
 * The Google Ads REST API (v25) mutate/OAuth calls this connector needs,
 * kept as a small interface (not the `google-ads-api` npm SDK) so a run's
 * own executor can be driven by a fake client in tests without any network
 * access — the same "buildable-today, swap the provider later" seam
 * `StripeApiClient`/`WarehouseQueryExecutor`/`KmsProvider` already
 * established for their own external-system boundaries.
 */
export interface GoogleAdsApiClient {
  /** Creates a whole paused Search campaign (budget + campaign + ad group(s) + RSA ad(s) + keywords/negatives) in one call — see `GoogleAdsHttpApiClient`'s own doc comment for why this isn't a single atomic Google Ads mutate request. */
  createCampaignDraft(customerId: string, draft: GoogleAdsCampaignDraft): Promise<GoogleAdsCreateCampaignDraftResult>;
  setCampaignBudgetAmount(customerId: string, campaignBudgetResourceName: string, dailyBudgetUsd: number): Promise<void>;
  setCampaignStatus(customerId: string, campaignResourceName: string, status: GoogleAdsCampaignStatus): Promise<void>;
  /**
   * Looks up a campaign's own budget-resource name via GAQL — used by
   * `GoogleAdsAutomationActionExecutor` for a `budget_change` action against
   * a target seeded to represent a pre-existing campaign this plugin didn't
   * create (so `campaign_budget_resource_name` was never recorded). Throws
   * `GoogleAdsApiError` if `campaignResourceName` doesn't resolve to a real
   * campaign.
   */
  lookupCampaignBudgetResourceName(customerId: string, campaignResourceName: string): Promise<string>;
  /**
   * Reads a campaign's own live status + daily budget via GAQL (the
   * `readCampaignState` read seam, KAN-43 groundwork) — the same
   * `googleAds:search` call shape as {@link lookupCampaignBudgetResourceName},
   * selecting `campaign.status` and `campaign_budget.amount_micros` instead.
   * Throws `GoogleAdsApiError` if `campaignResourceName` doesn't resolve to a
   * real campaign.
   */
  lookupCampaignState(customerId: string, campaignResourceName: string): Promise<GoogleAdsCampaignStateResult>;
  /**
   * Creates a CRM-based (Customer Match) `UserList` on the given customer —
   * used by `GoogleCustomerMatchSinkPluginExecutor` (KAN-72 follow-up,
   * plan `13 §E21.2`'s own deferred "audience attach" bullet) the first
   * time an install syncs a segment, mirroring `MetaAdsApiClient.createCustomAudience`'s
   * own "create once, reuse on every later sync" role for the sibling
   * connector.
   */
  createCustomerMatchUserList(customerId: string, params: { name: string }): Promise<GoogleAdsCreateCustomerMatchUserListResult>;
  /**
   * Uploads a batch of contact match keys (email/phone already SHA-256-hashed,
   * a mobile id deliberately not — see `GoogleAdsContactMatchKey`'s own doc
   * comment) to an existing Customer Match user list — the Google Ads
   * member-upload flow is
   * itself three sequential calls (create an `OfflineUserDataJob`, add its
   * member operations, run the job), unlike Meta's single "add hashed
   * contacts" endpoint; this method sequences all three so the executor sees
   * one upload call, mirroring `MetaAdsApiClient.addContactsToCustomAudience`'s
   * shape for the sibling connector.
   */
  addContactsToCustomerMatchUserList(
    customerId: string,
    userListResourceName: string,
    contacts: readonly GoogleAdsContactMatchKey[],
    consent?: GoogleAdsCustomerMatchConsent,
  ): Promise<GoogleAdsAddCustomerMatchOperationsResult>;
  /**
   * Adds keywords and/or negative keywords to an already-created ad group
   * (KAN-72 follow-up, "post-creation keyword edits") — the same
   * `adGroupCriteria:mutate` `create` operation shape `createCampaignDraft`
   * already uses for a brand-new ad group's own keywords, reused here
   * against an existing one. A no-op call (`keywords` and `negativeKeywords`
   * both empty) is never made — the caller validates at least one is
   * non-empty before this is reached (see `validateKeywordEditActionInput`).
   */
  addAdGroupKeywords(
    customerId: string,
    adGroupResourceName: string,
    keywords: readonly CampaignDraftKeyword[],
    negativeKeywords: readonly CampaignDraftKeyword[],
  ): Promise<GoogleAdsAddAdGroupKeywordsResult>;
  /**
   * Removes ad-group criteria (keywords/negative keywords) by their own
   * resource name — used by `GoogleAdsAutomationActionExecutor.rollbackKeywordEdit`
   * to undo exactly the criteria a `keyword_edit` action itself added, never
   * an existing criterion the action didn't create.
   */
  removeAdGroupCriteria(customerId: string, criterionResourceNames: readonly string[]): Promise<void>;
  /**
   * Creates a new Responsive Search Ad in an already-existing ad group, with
   * the given initial status — used both by `createCampaignDraft` (a
   * brand-new ad group's own first ad, always `PAUSED`) and by
   * `GoogleAdsAutomationActionExecutor.executeAdEdit` (KAN-72 follow-up,
   * "post-creation ad edits") to create the replacement ad carrying a
   * caller's edited headlines/descriptions/final URL, `ENABLED` so the edit
   * takes effect immediately (this action executes only after human
   * approval, same posture `keyword_edit`/`budget_change` already take).
   * Google Ads' `Ad` resource is immutable once created — no partial update
   * of an RSA's own creative text is offered by the API — so "editing" an ad
   * is create-new + pause-old rather than a true in-place update; see
   * `executeAdEdit`'s own doc comment for exactly how.
   */
  createResponsiveSearchAd(
    customerId: string,
    adGroupResourceName: string,
    ad: GoogleAdsResponsiveSearchAdContent,
    status: GoogleAdsCampaignStatus,
  ): Promise<GoogleAdsCreateResponsiveSearchAdResult>;
  /**
   * Sets an existing ad's own status (`ENABLED`/`PAUSED`/`REMOVED`, the same
   * vocabulary a campaign's own status uses) — used by `executeAdEdit`/
   * `rollbackAdEdit` to pause the superseded ad on execute and restore it (or
   * remove the replacement) on rollback, mirroring `setCampaignStatus`'s
   * exact shape one resource type down.
   */
  setAdGroupAdStatus(customerId: string, adResourceName: string, status: GoogleAdsCampaignStatus): Promise<void>;
  /**
   * Uploads an image to the account's asset library as an image asset (Ad Studio image export), ready
   * to be used in responsive display and Performance Max ads. Returns the asset's resource name.
   */
  uploadImageAsset(customerId: string, params: { name: string; base64Data: string }): Promise<{ assetResourceName: string }>;
  /** Creates a paused Display campaign (budget, campaign, ad group) with one responsive display ad. */
  createDisplayAdCampaign(customerId: string, params: GoogleAdsDisplayAdCampaignParams): Promise<GoogleAdsDisplayAdCampaignResult>;
  /**
   * Creates a paused Search campaign (Google Search only, no Display expansion) targeting the given
   * locations and languages, with one ad group holding a responsive search ad, the keywords and the
   * negative keywords.
   */
  createSearchAdCampaign(customerId: string, params: GoogleAdsSearchAdCampaignParams): Promise<GoogleAdsDisplayAdCampaignResult>;
}

/**
 * The Google Ads API version every call uses (KAN-233: was v17, long sunset). The request bodies
 * below were checked field by field against Google's v25 discovery document.
 */
export const GOOGLE_ADS_API_VERSION = 'v25';
const GOOGLE_ADS_API_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Refresh 60s before Google's own reported expiry, so a call in flight never races an about-to-expire token. */
const ACCESS_TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;

/**
 * Exchanges the credential's long-lived refresh token for a short-lived access token at Google's
 * OAuth2 token endpoint. Shared by the mutate client and the keyword-ideas lookup (KAN-230). The
 * token is returned in memory only; a failure never includes the request body (which carries the
 * client secret and refresh token) in its message.
 */
export async function requestGoogleAdsAccessToken(
  options: Pick<GoogleAdsApiClientOptions, 'clientId' | 'clientSecret' | 'refreshToken'>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      refresh_token: options.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!response.ok) {
    throw new GoogleAdsApiError(`Failed to refresh a Google Ads OAuth access token (status ${response.status}).`, response.status);
  }
  const body = (await response.json()) as { access_token: string; expires_in: number };
  return { accessToken: body.access_token, expiresInSeconds: body.expires_in };
}

interface CachedAccessToken {
  token: string;
  expiresAtMs: number;
}

interface MutateResult {
  results: Array<{ resourceName: string }>;
}

function usdToMicros(usd: number): string {
  return String(Math.round(usd * 1_000_000));
}

/**
 * The real Google Ads API client — plain `fetch` against Google's documented
 * REST mutate endpoints and OAuth2 token endpoint, no SDK dependency. This is
 * the implementation `GoogleAdsAutomationActionExecutor` uses by default in
 * production; every automated test in this repo drives the executor with a
 * fake {@link GoogleAdsApiClient} instead, since there is no real Google Ads
 * test account reachable from CI (KAN-43's dev-token approval is still
 * outstanding) — the same "E2E on a real account is deferred" posture
 * KAN-49/50/51's own AC bars already carry.
 *
 * `createCampaignDraft` issues a sequence of individual mutate calls (budget
 * -> campaign -> per ad group: ad group -> RSA ad -> keywords/negatives)
 * rather than one atomic batched request — Google Ads *does* support
 * temporary resource names to batch a whole tree in one mutate call, but
 * that adds real complexity (temp-id bookkeeping across resource types) this
 * story's "buildable-today, actually works" bar doesn't require; a partial
 * failure here simply leaves an incomplete but PAUSED draft rather than
 * rolling back automatically — an acceptable gap for a paused, not-yet-live
 * campaign a human reviews before activating.
 */
export class GoogleAdsHttpApiClient implements GoogleAdsApiClient {
  private cachedAccessToken: CachedAccessToken | null = null;

  constructor(private readonly options: GoogleAdsApiClientOptions) {}

  private async getAccessToken(): Promise<string> {
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAtMs > Date.now()) {
      return this.cachedAccessToken.token;
    }
    const body = await requestGoogleAdsAccessToken(this.options);
    this.cachedAccessToken = { token: body.accessToken, expiresAtMs: Date.now() + body.expiresInSeconds * 1000 - ACCESS_TOKEN_EXPIRY_SAFETY_MARGIN_MS };
    return this.cachedAccessToken.token;
  }

  private async mutate(customerId: string, resource: string, operations: readonly unknown[]): Promise<MutateResult> {
    const accessToken = await this.getAccessToken();
    const response = await fetch(`${GOOGLE_ADS_API_BASE_URL}/customers/${customerId}/${resource}:mutate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': this.options.developerToken,
        ...(this.options.loginCustomerId ? { 'login-customer-id': this.options.loginCustomerId } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operations }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new GoogleAdsApiError(`Google Ads API request to ${resource}:mutate failed with status ${response.status}: ${detail}`, response.status);
    }
    return (await response.json()) as MutateResult;
  }

  async createCampaignDraft(customerId: string, draft: GoogleAdsCampaignDraft): Promise<GoogleAdsCreateCampaignDraftResult> {
    const budgetResult = await this.mutate(customerId, 'campaignBudgets', [
      { create: { name: `${draft.campaignName} Budget`, amountMicros: usdToMicros(draft.dailyBudgetUsd), deliveryMethod: 'STANDARD' } },
    ]);
    const campaignBudgetResourceName = budgetResult.results[0].resourceName;

    const campaignResult = await this.mutate(customerId, 'campaigns', [
      {
        create: {
          name: draft.campaignName,
          advertisingChannelType: draft.advertisingChannelType,
          status: 'PAUSED',
          campaignBudget: campaignBudgetResourceName,
          manualCpc: {},
          containsEuPoliticalAdvertising: draft.containsEuPoliticalAdvertising
            ? 'CONTAINS_EU_POLITICAL_ADVERTISING'
            : 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        },
      },
    ]);
    const campaignResourceName = campaignResult.results[0].resourceName;

    const adGroupResourceNames: string[] = [];
    const adResourceNames: string[] = [];

    for (const adGroup of draft.adGroups) {
      const adGroupResult = await this.mutate(customerId, 'adGroups', [
        { create: { name: adGroup.name, campaign: campaignResourceName, status: 'ENABLED', type: 'SEARCH_STANDARD' } },
      ]);
      const adGroupResourceName = adGroupResult.results[0].resourceName;
      adGroupResourceNames.push(adGroupResourceName);

      const adResult = await this.createResponsiveSearchAd(customerId, adGroupResourceName, adGroup.responsiveSearchAd, 'PAUSED');
      adResourceNames.push(adResult.adResourceName);

      const criterionOperations = [
        ...adGroup.keywords.map((keyword) => ({
          create: { adGroup: adGroupResourceName, status: 'ENABLED', keyword: { text: keyword.text, matchType: keyword.matchType } },
        })),
        ...adGroup.negativeKeywords.map((keyword) => ({
          create: { adGroup: adGroupResourceName, negative: true, keyword: { text: keyword.text, matchType: keyword.matchType } },
        })),
      ];
      if (criterionOperations.length > 0) {
        await this.mutate(customerId, 'adGroupCriteria', criterionOperations);
      }
    }

    return { campaignResourceName, campaignBudgetResourceName, adGroupResourceNames, adResourceNames };
  }

  async setCampaignBudgetAmount(customerId: string, campaignBudgetResourceName: string, dailyBudgetUsd: number): Promise<void> {
    await this.mutate(customerId, 'campaignBudgets', [
      { update: { resourceName: campaignBudgetResourceName, amountMicros: usdToMicros(dailyBudgetUsd) }, updateMask: 'amountMicros' },
    ]);
  }

  async setCampaignStatus(customerId: string, campaignResourceName: string, status: GoogleAdsCampaignStatus): Promise<void> {
    await this.mutate(customerId, 'campaigns', [{ update: { resourceName: campaignResourceName, status }, updateMask: 'status' }]);
  }

  async lookupCampaignBudgetResourceName(customerId: string, campaignResourceName: string): Promise<string> {
    const accessToken = await this.getAccessToken();
    // `campaignResourceName` can originate from a caller-supplied automation
    // target id (see `GoogleAdsAutomationActionExecutor.resolveCampaignBudgetResourceName`) —
    // escape it before splicing into the GAQL string literal so it can't break out of the
    // WHERE clause (GAQL, like SQL, escapes an embedded `'` as `\'`).
    const escapedCampaignResourceName = campaignResourceName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const query = `SELECT campaign.campaign_budget FROM campaign WHERE campaign.resource_name = '${escapedCampaignResourceName}'`;
    const response = await fetch(`${GOOGLE_ADS_API_BASE_URL}/customers/${customerId}/googleAds:search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': this.options.developerToken,
        ...(this.options.loginCustomerId ? { 'login-customer-id': this.options.loginCustomerId } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new GoogleAdsApiError(`Google Ads API search for campaign "${campaignResourceName}" failed with status ${response.status}: ${detail}`, response.status);
    }
    const body = (await response.json()) as { results?: Array<{ campaign?: { campaignBudget?: string } }> };
    const budgetResourceName = body.results?.[0]?.campaign?.campaignBudget;
    if (!budgetResourceName) {
      throw new GoogleAdsApiError(`No Google Ads campaign found for resource name "${campaignResourceName}".`, 404);
    }
    return budgetResourceName;
  }

  async lookupCampaignState(customerId: string, campaignResourceName: string): Promise<GoogleAdsCampaignStateResult> {
    const accessToken = await this.getAccessToken();
    // Same caller-supplied-id escaping reasoning as `lookupCampaignBudgetResourceName` above.
    const escapedCampaignResourceName = campaignResourceName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const query = `SELECT campaign.status, campaign_budget.amount_micros FROM campaign WHERE campaign.resource_name = '${escapedCampaignResourceName}'`;
    const response = await fetch(`${GOOGLE_ADS_API_BASE_URL}/customers/${customerId}/googleAds:search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': this.options.developerToken,
        ...(this.options.loginCustomerId ? { 'login-customer-id': this.options.loginCustomerId } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new GoogleAdsApiError(`Google Ads API search for campaign "${campaignResourceName}" failed with status ${response.status}: ${detail}`, response.status);
    }
    const body = (await response.json()) as {
      results?: Array<{ campaign?: { status?: GoogleAdsCampaignStatus }; campaignBudget?: { amountMicros?: string } }>;
    };
    const status = body.results?.[0]?.campaign?.status;
    if (!status) {
      throw new GoogleAdsApiError(`No Google Ads campaign found for resource name "${campaignResourceName}".`, 404);
    }
    const amountMicros = body.results?.[0]?.campaignBudget?.amountMicros;
    return { status, dailyBudgetUsd: amountMicros !== undefined ? Number(amountMicros) / 1_000_000 : null };
  }

  /**
   * A non-`:mutate` action call (`:create`/`:addOperations`/`:run` on an
   * offline user data job) — same auth/header shape as {@link mutate}, but
   * the endpoint path and body shape differ per action, so this takes the
   * path *as-is* (not auto-prefixed with `customers/{customerId}/` the way
   * {@link mutate} prefixes a bare resource name) since an `:addOperations`/
   * `:run` call targets a job's own already-fully-qualified resource name
   * (e.g. `customers/123/offlineUserDataJobs/456`), not a bare resource
   * under the customer.
   */
  private async postAction<T>(path: string, body: unknown): Promise<T> {
    const accessToken = await this.getAccessToken();
    const response = await fetch(`${GOOGLE_ADS_API_BASE_URL}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': this.options.developerToken,
        ...(this.options.loginCustomerId ? { 'login-customer-id': this.options.loginCustomerId } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new GoogleAdsApiError(`Google Ads API request to ${path} failed with status ${response.status}: ${detail}`, response.status);
    }
    return (await response.json()) as T;
  }

  async createCustomerMatchUserList(customerId: string, params: { name: string }): Promise<GoogleAdsCreateCustomerMatchUserListResult> {
    const result = await this.mutate(customerId, 'userLists', [
      {
        create: {
          name: params.name,
          membershipStatus: 'OPEN',
          // The resource field is `crmBasedUserList` (its type is CrmBasedUserListInfo); the old
          // `crmBasedUserListInfo` key was rejected as an unknown field (KAN-233).
          crmBasedUserList: { uploadKeyType: 'CONTACT_INFO' },
        },
      },
    ]);
    return { userListResourceName: result.results[0].resourceName };
  }

  async addContactsToCustomerMatchUserList(
    customerId: string,
    userListResourceName: string,
    contacts: readonly GoogleAdsContactMatchKey[],
    consent?: GoogleAdsCustomerMatchConsent,
  ): Promise<GoogleAdsAddCustomerMatchOperationsResult> {
    // Job-level consent (KAN-236): only the answers the advertiser actually gave are sent.
    const consentBody = {
      ...(consent?.adUserData ? { adUserData: consent.adUserData } : {}),
      ...(consent?.adPersonalization ? { adPersonalization: consent.adPersonalization } : {}),
    };
    const jobResult = await this.postAction<{ resourceName: string }>(`customers/${customerId}/offlineUserDataJobs:create`, {
      job: {
        type: 'CUSTOMER_MATCH_USER_LIST',
        customerMatchUserListMetadata: { userList: userListResourceName, ...(Object.keys(consentBody).length > 0 ? { consent: consentBody } : {}) },
      },
    });
    const jobResourceName = jobResult.resourceName;

    await this.postAction(`${jobResourceName}:addOperations`, {
      operations: contacts.map((contact) => ({
        create: {
          userIdentifiers: [
            ...(contact.hashedEmail !== undefined ? [{ hashedEmail: contact.hashedEmail }] : []),
            ...(contact.hashedPhoneNumber !== undefined ? [{ hashedPhoneNumber: contact.hashedPhoneNumber }] : []),
            ...(contact.mobileId !== undefined ? [{ mobileId: contact.mobileId }] : []),
            ...(contact.addressInfo !== undefined ? [{ addressInfo: contact.addressInfo }] : []),
          ],
        },
      })),
    });

    await this.postAction(`${jobResourceName}:run`, {});

    return { numReceived: contacts.length };
  }

  async addAdGroupKeywords(
    customerId: string,
    adGroupResourceName: string,
    keywords: readonly CampaignDraftKeyword[],
    negativeKeywords: readonly CampaignDraftKeyword[],
  ): Promise<GoogleAdsAddAdGroupKeywordsResult> {
    const operations = [
      ...keywords.map((keyword) => ({
        create: { adGroup: adGroupResourceName, status: 'ENABLED', keyword: { text: keyword.text, matchType: keyword.matchType } },
      })),
      ...negativeKeywords.map((keyword) => ({
        create: { adGroup: adGroupResourceName, negative: true, keyword: { text: keyword.text, matchType: keyword.matchType } },
      })),
    ];
    const result = await this.mutate(customerId, 'adGroupCriteria', operations);
    return {
      keywordResourceNames: result.results.slice(0, keywords.length).map((entry) => entry.resourceName),
      negativeKeywordResourceNames: result.results.slice(keywords.length).map((entry) => entry.resourceName),
    };
  }

  async removeAdGroupCriteria(customerId: string, criterionResourceNames: readonly string[]): Promise<void> {
    await this.mutate(
      customerId,
      'adGroupCriteria',
      criterionResourceNames.map((resourceName) => ({ remove: resourceName })),
    );
  }

  async createResponsiveSearchAd(
    customerId: string,
    adGroupResourceName: string,
    ad: GoogleAdsResponsiveSearchAdContent,
    status: GoogleAdsCampaignStatus,
  ): Promise<GoogleAdsCreateResponsiveSearchAdResult> {
    const result = await this.mutate(customerId, 'adGroupAds', [
      {
        create: {
          adGroup: adGroupResourceName,
          status,
          ad: {
            responsiveSearchAd: {
              headlines: ad.headlines.map((text) => ({ text })),
              descriptions: ad.descriptions.map((text) => ({ text })),
            },
            finalUrls: [ad.finalUrl],
          },
        },
      },
    ]);
    return { adResourceName: result.results[0].resourceName };
  }

  async setAdGroupAdStatus(customerId: string, adResourceName: string, status: GoogleAdsCampaignStatus): Promise<void> {
    await this.mutate(customerId, 'adGroupAds', [{ update: { resourceName: adResourceName, status }, updateMask: 'status' }]);
  }

  async createDisplayAdCampaign(customerId: string, params: GoogleAdsDisplayAdCampaignParams): Promise<GoogleAdsDisplayAdCampaignResult> {
    // A non-shared budget is named after its campaign; everything is created PAUSED for a person to review.
    const budget = await this.mutate(customerId, 'campaignBudgets', [
      { create: { name: `${params.name} Budget`, amountMicros: String(Math.round(params.dailyBudgetMicros)), deliveryMethod: 'STANDARD', explicitlyShared: false } },
    ]);
    const campaignBudgetResourceName = budget.results[0].resourceName;
    const campaign = await this.mutate(customerId, 'campaigns', [
      {
        create: {
          name: params.name,
          advertisingChannelType: 'DISPLAY',
          status: 'PAUSED',
          campaignBudget: campaignBudgetResourceName,
          manualCpc: {},
          containsEuPoliticalAdvertising: params.containsEuPoliticalAdvertising ? 'CONTAINS_EU_POLITICAL_ADVERTISING' : 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        },
      },
    ]);
    const campaignResourceName = campaign.results[0].resourceName;
    try {
      return await this.createDisplayAdGroupAndAd(customerId, params, campaignBudgetResourceName, campaignResourceName);
    } catch (error) {
      // Nothing half-built is left behind: remove the campaign and its budget, then report the real error.
      await this.mutate(customerId, 'campaigns', [{ remove: campaignResourceName }]).catch(() => undefined);
      await this.mutate(customerId, 'campaignBudgets', [{ remove: campaignBudgetResourceName }]).catch(() => undefined);
      throw error;
    }
  }

  private async createDisplayAdGroupAndAd(
    customerId: string,
    params: GoogleAdsDisplayAdCampaignParams,
    campaignBudgetResourceName: string,
    campaignResourceName: string,
  ): Promise<GoogleAdsDisplayAdCampaignResult> {
    const adGroup = await this.mutate(customerId, 'adGroups', [
      { create: { name: `${params.name} - ad group`, campaign: campaignResourceName, status: 'ENABLED', type: 'DISPLAY_STANDARD', cpcBidMicros: String(Math.round(params.cpcBidMicros)) } },
    ]);
    const adGroupResourceName = adGroup.results[0].resourceName;
    const ad = await this.mutate(customerId, 'adGroupAds', [
      {
        create: {
          adGroup: adGroupResourceName,
          status: 'PAUSED',
          ad: {
            name: params.name,
            finalUrls: [params.finalUrl],
            responsiveDisplayAd: {
              marketingImages: params.marketingImageAssets.map((asset) => ({ asset })),
              squareMarketingImages: params.squareImageAssets.map((asset) => ({ asset })),
              headlines: params.headlines.map((text) => ({ text })),
              longHeadline: { text: params.longHeadline },
              descriptions: params.descriptions.map((text) => ({ text })),
              businessName: params.businessName,
            },
          },
        },
      },
    ]);
    return { campaignBudgetResourceName, campaignResourceName, adGroupResourceName, adResourceName: ad.results[0].resourceName };
  }

  async createSearchAdCampaign(customerId: string, params: GoogleAdsSearchAdCampaignParams): Promise<GoogleAdsDisplayAdCampaignResult> {
    // Everything is created PAUSED for a person to review; the budget is named after its campaign.
    const budget = await this.mutate(customerId, 'campaignBudgets', [
      { create: { name: `${params.name} Budget`, amountMicros: String(Math.round(params.dailyBudgetMicros)), deliveryMethod: 'STANDARD', explicitlyShared: false } },
    ]);
    const campaignBudgetResourceName = budget.results[0].resourceName;
    const campaign = await this.mutate(customerId, 'campaigns', [
      {
        create: {
          name: params.name,
          advertisingChannelType: 'SEARCH',
          status: 'PAUSED',
          campaignBudget: campaignBudgetResourceName,
          manualCpc: {},
          // Google Search only: no search partners and no Display expansion, so the spend goes where the keywords were researched.
          networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
          containsEuPoliticalAdvertising: params.containsEuPoliticalAdvertising ? 'CONTAINS_EU_POLITICAL_ADVERTISING' : 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        },
      },
    ]);
    const campaignResourceName = campaign.results[0].resourceName;
    try {
      const criteria = [
        ...params.geoTargetConstants.map((geoTargetConstant) => ({ create: { campaign: campaignResourceName, location: { geoTargetConstant } } })),
        ...params.languageConstants.map((languageConstant) => ({ create: { campaign: campaignResourceName, language: { languageConstant } } })),
      ];
      if (criteria.length) await this.mutate(customerId, 'campaignCriteria', criteria);
      const adGroup = await this.mutate(customerId, 'adGroups', [
        { create: { name: `${params.name} - ad group`, campaign: campaignResourceName, status: 'ENABLED', type: 'SEARCH_STANDARD', cpcBidMicros: String(Math.round(params.cpcBidMicros)) } },
      ]);
      const adGroupResourceName = adGroup.results[0].resourceName;
      const ad = await this.mutate(customerId, 'adGroupAds', [
        {
          create: {
            adGroup: adGroupResourceName,
            status: 'PAUSED',
            ad: {
              finalUrls: [params.finalUrl],
              responsiveSearchAd: {
                headlines: params.headlines.map((text) => ({ text })),
                descriptions: params.descriptions.map((text) => ({ text })),
                ...(params.path1 ? { path1: params.path1 } : {}),
                ...(params.path1 && params.path2 ? { path2: params.path2 } : {}),
              },
            },
          },
        },
      ]);
      const keywordOperations = [
        ...params.keywords.map((keyword) => ({ create: { adGroup: adGroupResourceName, status: 'ENABLED', keyword: { text: keyword.text, matchType: keyword.matchType } } })),
        ...params.negativeKeywords.map((text) => ({ create: { adGroup: adGroupResourceName, negative: true, keyword: { text, matchType: 'PHRASE' } } })),
      ];
      if (keywordOperations.length) await this.mutate(customerId, 'adGroupCriteria', keywordOperations);
      return { campaignBudgetResourceName, campaignResourceName, adGroupResourceName, adResourceName: ad.results[0].resourceName };
    } catch (error) {
      // Nothing half-built is left behind: remove the campaign (with its criteria and ad group) and its budget.
      await this.mutate(customerId, 'campaigns', [{ remove: campaignResourceName }]).catch(() => undefined);
      await this.mutate(customerId, 'campaignBudgets', [{ remove: campaignBudgetResourceName }]).catch(() => undefined);
      throw error;
    }
  }

  async uploadImageAsset(customerId: string, params: { name: string; base64Data: string }): Promise<{ assetResourceName: string }> {
    // v25 Asset: `type` is output only; an `imageAsset` with `data` makes it an IMAGE asset.
    const result = await this.mutate(customerId, 'assets', [{ create: { name: params.name, imageAsset: { data: params.base64Data } } }]);
    return { assetResourceName: result.results[0].resourceName };
  }
}
