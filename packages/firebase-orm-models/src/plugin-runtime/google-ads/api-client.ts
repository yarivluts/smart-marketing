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
  /** The number of hashed-email member operations submitted to the offline user data job — Google processes the job asynchronously, so this is "accepted", not "matched" (Google Ads has no synchronous match-count response, unlike Meta's `num_received`). */
  numReceived: number;
}

export interface GoogleAdsAddAdGroupKeywordsResult {
  keywordResourceNames: string[];
  negativeKeywordResourceNames: string[];
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
   * Uploads a batch of already-SHA-256-hashed emails to an existing
   * Customer Match user list — the Google Ads member-upload flow is itself
   * three sequential calls (create an `OfflineUserDataJob`, add its member
   * operations, run the job), unlike Meta's single "add hashed emails"
   * endpoint; this method sequences all three so the executor sees one
   * upload call, mirroring `MetaAdsApiClient.addHashedEmailsToCustomAudience`'s
   * shape for the sibling connector.
   */
  addHashedEmailsToCustomerMatchUserList(customerId: string, userListResourceName: string, hashedEmails: readonly string[]): Promise<GoogleAdsAddCustomerMatchOperationsResult>;
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

      const adResult = await this.mutate(customerId, 'adGroupAds', [
        {
          create: {
            adGroup: adGroupResourceName,
            status: 'PAUSED',
            ad: {
              responsiveSearchAd: {
                headlines: adGroup.responsiveSearchAd.headlines.map((text) => ({ text })),
                descriptions: adGroup.responsiveSearchAd.descriptions.map((text) => ({ text })),
              },
              finalUrls: [adGroup.responsiveSearchAd.finalUrl],
            },
          },
        },
      ]);
      adResourceNames.push(adResult.results[0].resourceName);

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

  async addHashedEmailsToCustomerMatchUserList(
    customerId: string,
    userListResourceName: string,
    hashedEmails: readonly string[],
  ): Promise<GoogleAdsAddCustomerMatchOperationsResult> {
    const jobResult = await this.postAction<{ resourceName: string }>(`customers/${customerId}/offlineUserDataJobs:create`, {
      job: { type: 'CUSTOMER_MATCH_USER_LIST', customerMatchUserListMetadata: { userList: userListResourceName } },
    });
    const jobResourceName = jobResult.resourceName;

    await this.postAction(`${jobResourceName}:addOperations`, {
      operations: hashedEmails.map((hashedEmail) => ({ create: { userIdentifiers: [{ hashedEmail }] } })),
    });

    await this.postAction(`${jobResourceName}:run`, {});

    return { numReceived: hashedEmails.length };
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
}
