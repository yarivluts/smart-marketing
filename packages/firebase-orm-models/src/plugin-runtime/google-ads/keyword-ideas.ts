import { GOOGLE_ADS_API_VERSION, GoogleAdsApiError, requestGoogleAdsAccessToken } from './api-client';
import type { GoogleAdsCredentialSecret } from './credential-secret';

/**
 * Keyword ideas with real search volumes from the Google Ads API's KeywordPlanIdeaService
 * (`customers/{customerId}:generateKeywordIdeas`), for the Ad Studio's planning stage (KAN-230).
 * Pinned to v25, checked against Google's v25 discovery document: the request takes exactly one
 * seed (`keywordSeed`, `urlSeed` or `keywordAndUrlSeed`, 1-20 keywords), `language`,
 * `geoTargetConstants` (max 10), `keywordPlanNetwork` and `pageSize`; each result has `text` and
 * `keywordIdeaMetrics` whose int64 fields (`avgMonthlySearches`, `lowTopOfPageBidMicros`,
 * `highTopOfPageBidMicros`) arrive as JSON strings. A read-only call - it creates nothing in the
 * account - but it does need a developer token with at least Basic access.
 */

export const GOOGLE_ADS_KEYWORD_IDEAS_API_VERSION = GOOGLE_ADS_API_VERSION;
const GOOGLE_ADS_KEYWORD_IDEAS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_KEYWORD_IDEAS_API_VERSION}`;
const MAX_SEED_KEYWORDS = 20;
const MAX_GEO_TARGETS = 10;
export const GOOGLE_ADS_KEYWORD_IDEAS_TIMEOUT_MS = 15_000;

export interface GoogleAdsKeywordIdeasRequest {
  keywords: readonly string[];
  url: string | null;
  /** `languageConstants/{id}`, or null for every language. */
  language: string | null;
  /** `geoTargetConstants/{id}` names; empty for every location. */
  geoTargetConstants: readonly string[];
  pageSize: number;
}

export type GoogleAdsKeywordCompetition = 'LOW' | 'MEDIUM' | 'HIGH';

export interface GoogleAdsKeywordIdea {
  text: string;
  avgMonthlySearches: number | null;
  competition: GoogleAdsKeywordCompetition | null;
  /** Micros of the account's currency; null when Google reported none. */
  lowTopOfPageBidMicros: number | null;
  highTopOfPageBidMicros: number | null;
}

/**
 * Why a lookup failed, as a stable code: the OAuth refresh was refused (`auth_failed`), the
 * developer token lacks the access level this service needs (`developer_token_not_approved`), or
 * anything else the API rejected (`api_error`).
 */
export type GoogleAdsKeywordIdeasFailure = 'auth_failed' | 'developer_token_not_approved' | 'api_error';

export class GoogleAdsKeywordIdeasError extends GoogleAdsApiError {
  constructor(
    public readonly failure: GoogleAdsKeywordIdeasFailure,
    message: string,
    status: number,
  ) {
    super(message, status);
    this.name = 'GoogleAdsKeywordIdeasError';
  }
}

interface KeywordIdeasResponseBody {
  results?: {
    text?: string;
    keywordIdeaMetrics?: {
      avgMonthlySearches?: string | number;
      competition?: string;
      lowTopOfPageBidMicros?: string | number;
      highTopOfPageBidMicros?: string | number;
    };
  }[];
}

function int64(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function competition(value: string | undefined): GoogleAdsKeywordCompetition | null {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' ? value : null;
}

/** The request body for one lookup: the seed shape follows which of keywords and URL there are. */
export function buildKeywordIdeasRequestBody(request: GoogleAdsKeywordIdeasRequest): Record<string, unknown> {
  const keywords = request.keywords.slice(0, MAX_SEED_KEYWORDS);
  const seed =
    keywords.length > 0 && request.url
      ? { keywordAndUrlSeed: { url: request.url, keywords } }
      : keywords.length > 0
        ? { keywordSeed: { keywords } }
        : { urlSeed: { url: request.url } };
  return {
    ...(request.language ? { language: request.language } : {}),
    geoTargetConstants: request.geoTargetConstants.slice(0, MAX_GEO_TARGETS),
    includeAdultKeywords: false,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    pageSize: request.pageSize,
    ...seed,
  };
}

function failureFor(status: number, detail: string): GoogleAdsKeywordIdeasFailure {
  if (/DEVELOPER_TOKEN_NOT_APPROVED|DEVELOPER_TOKEN_PROHIBITED|DEVELOPER_TOKEN_INVALID|developer token/i.test(detail)) return 'developer_token_not_approved';
  if (status === 401) return 'auth_failed';
  return 'api_error';
}

/**
 * One page of keyword ideas for the credential's customer. Throws {@link GoogleAdsKeywordIdeasError}
 * on any failure; the credential is used only to authenticate this call and never appears in an
 * error message.
 */
export async function generateGoogleAdsKeywordIdeas(
  credential: GoogleAdsCredentialSecret,
  request: GoogleAdsKeywordIdeasRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleAdsKeywordIdea[]> {
  if (request.keywords.length === 0 && !request.url) throw new GoogleAdsKeywordIdeasError('api_error', 'A keyword ideas lookup needs a seed keyword or URL.', 400);
  let accessToken: string;
  try {
    ({ accessToken } = await requestGoogleAdsAccessToken(credential, fetchImpl));
  } catch (error) {
    const status = error instanceof GoogleAdsApiError ? error.status : 0;
    throw new GoogleAdsKeywordIdeasError('auth_failed', error instanceof Error ? error.message : 'The Google Ads OAuth refresh failed.', status);
  }
  const customerId = credential.customerId.replace(/-/g, '');
  const response = await fetchImpl(`${GOOGLE_ADS_KEYWORD_IDEAS_BASE_URL}/customers/${customerId}:generateKeywordIdeas`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': credential.developerToken,
      ...(credential.loginCustomerId ? { 'login-customer-id': credential.loginCustomerId.replace(/-/g, '') } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildKeywordIdeasRequestBody(request)),
    signal: AbortSignal.timeout(GOOGLE_ADS_KEYWORD_IDEAS_TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw new GoogleAdsKeywordIdeasError('api_error', `The Google Ads keyword ideas request failed: ${error instanceof Error ? error.message : String(error)}`, 0);
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 2000);
    throw new GoogleAdsKeywordIdeasError(failureFor(response.status, detail), `Google Ads generateKeywordIdeas failed with status ${response.status}: ${detail}`, response.status);
  }
  const body = (await response.json().catch(() => ({}))) as KeywordIdeasResponseBody;
  return (body.results ?? [])
    .filter((result) => typeof result.text === 'string' && result.text.trim().length > 0)
    .map((result) => ({
      text: (result.text as string).trim(),
      avgMonthlySearches: int64(result.keywordIdeaMetrics?.avgMonthlySearches),
      competition: competition(result.keywordIdeaMetrics?.competition),
      lowTopOfPageBidMicros: int64(result.keywordIdeaMetrics?.lowTopOfPageBidMicros),
      highTopOfPageBidMicros: int64(result.keywordIdeaMetrics?.highTopOfPageBidMicros),
    }));
}
