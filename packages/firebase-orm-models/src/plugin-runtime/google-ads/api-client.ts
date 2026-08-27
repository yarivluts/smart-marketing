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
 * The Google Ads REST API (v17) mutate/OAuth calls this connector needs,
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
  addContactsToCustomerMatchUserList(customerId: string, userListResourceName: string, contacts: readonly GoogleAdsContactMatchKey[]): Promise<GoogleAdsAddCustomerMatchOperationsResult>;
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
}

const GOOGLE_ADS_API_BASE_URL = 'https://googleads.googleapis.com/v17';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Refresh 60s before Google's own reported expiry, so a call in flight never races an about-to-expire token. */
const ACCESS_TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;

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
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        refresh_token: this.options.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!response.ok) {
      throw new GoogleAdsApiError(`Failed to refresh a Google Ads OAuth access token (status ${response.status}).`, response.status);
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.cachedAccessToken = { token: body.access_token, expiresAtMs: Date.now() + body.expires_in * 1000 - ACCESS_TOKEN_EXPIRY_SAFETY_MARGIN_MS };
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
          crmBasedUserListInfo: { uploadKeyType: 'CONTACT_INFO' },
        },
      },
    ]);
    return { userListResourceName: result.results[0].resourceName };
  }

  async addContactsToCustomerMatchUserList(
    customerId: string,
    userListResourceName: string,
    contacts: readonly GoogleAdsContactMatchKey[],
  ): Promise<GoogleAdsAddCustomerMatchOperationsResult> {
    const jobResult = await this.postAction<{ resourceName: string }>(`customers/${customerId}/offlineUserDataJobs:create`, {
      job: { type: 'CUSTOMER_MATCH_USER_LIST', customerMatchUserListMetadata: { userList: userListResourceName } },
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
}
