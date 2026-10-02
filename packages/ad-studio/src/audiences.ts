import { metaAdSetTargeting, metaLocaleFor, normalizeMetaTargeting, type AdStudioMetaTargeting } from '@growthos/shared';
import {
  buildMetaTargetingSpec,
  estimateMetaReach,
  getMetaPerformanceBreakdown,
  listMetaAudiences,
  MetaInsightsError,
  resolveAdStudioMetaReadCredential,
  searchMetaInterests,
  type AdStudioMetaReadUnavailable,
  type KmsProvider,
  type MetaAudience,
  type MetaBreakdown,
  type MetaInterest,
  type MetaPerformanceRow,
  type MetaReachEstimate,
} from '@growthos/firebase-orm-models';
import { ensureOrm } from './runtime';
import { serverKms } from './planning-sources';

/**
 * Audience planning from the project's real Meta ad account (read only): its existing audiences,
 * interest search, a reach estimate and its past results by segment. Each lookup answers with the
 * data or with why there is none - a missing credential or a refusal from Meta never fails a page.
 */

export type AdStudioAudienceUnavailable = AdStudioMetaReadUnavailable | 'meta_auth_failed' | 'meta_permission_denied' | 'meta_rate_limited' | 'meta_error';

export type AdStudioAudienceResult<T> = { status: 'ok'; data: T } | { status: 'unavailable'; reason: AdStudioAudienceUnavailable };

const FAILURE: Record<MetaInsightsError['failure'], AdStudioAudienceUnavailable> = {
  auth_failed: 'meta_auth_failed',
  permission_denied: 'meta_permission_denied',
  rate_limited: 'meta_rate_limited',
  api_error: 'meta_error',
};

interface Lookup {
  organizationId: string;
  projectId: string;
  kms?: KmsProvider | null;
  fetchImpl?: typeof fetch;
}

async function withMeta<T>(params: Lookup, run: (token: string, account: string, fetchImpl: typeof fetch) => Promise<T>): Promise<AdStudioAudienceResult<T>> {
  await ensureOrm();
  const credential = await resolveAdStudioMetaReadCredential(params.organizationId, params.projectId, params.kms === undefined ? serverKms() : params.kms);
  if (credential.status !== 'ok') return { status: 'unavailable', reason: credential.reason };
  try {
    return { status: 'ok', data: await run(credential.accessToken, credential.adAccountId, params.fetchImpl ?? fetch) };
  } catch (error) {
    if (error instanceof MetaInsightsError) return { status: 'unavailable', reason: FAILURE[error.failure] };
    throw error;
  }
}

/** The ad account's custom, lookalike and saved audiences with Meta's size ranges. */
export function loadAdStudioMetaAudiences(params: Lookup): Promise<AdStudioAudienceResult<MetaAudience[]>> {
  return withMeta(params, (token, account, fetchImpl) => listMetaAudiences(token, account, fetchImpl));
}

/** Meta interests matching a word, with audience sizes, named in the ad language when Meta has it. */
export function searchAdStudioMetaInterests(params: Lookup & { query: string; language: string }): Promise<AdStudioAudienceResult<MetaInterest[]>> {
  const query = params.query.replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!query) return Promise.resolve({ status: 'ok', data: [] });
  return withMeta(params, (token, _account, fetchImpl) => searchMetaInterests(token, query, metaLocaleFor(params.language), fetchImpl));
}

/** How many people a month Meta estimates the targeting reaches. */
export function estimateAdStudioMetaReach(params: Lookup & { targeting: AdStudioMetaTargeting }): Promise<AdStudioAudienceResult<MetaReachEstimate>> {
  const spec = buildMetaTargetingSpec({ ...metaAdSetTargeting(normalizeMetaTargeting(params.targeting)), advantageAudience: 0 });
  return withMeta(params, (token, account, fetchImpl) => estimateMetaReach(token, account, spec, fetchImpl));
}

/** The ad account's last 90 days by age and gender, placement or country. */
export function loadAdStudioMetaPerformance(params: Lookup & { breakdown: MetaBreakdown }): Promise<AdStudioAudienceResult<MetaPerformanceRow[]>> {
  return withMeta(params, (token, account, fetchImpl) => getMetaPerformanceBreakdown(token, account, params.breakdown, fetchImpl));
}
