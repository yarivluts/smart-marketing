import type { CampaignDraft } from '../../automation-runtime';

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
  createCampaignDraft(customerId: string, draft: CampaignDraft): Promise<GoogleAdsCreateCampaignDraftResult>;
  setCampaignBudgetAmount(customerId: string, campaignBudgetResourceName: string, dailyBudgetUsd: number): Promise<void>;
  setCampaignStatus(customerId: string, campaignResourceName: string, status: GoogleAdsCampaignStatus): Promise<void>;
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

  async createCampaignDraft(customerId: string, draft: CampaignDraft): Promise<GoogleAdsCreateCampaignDraftResult> {
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
}
