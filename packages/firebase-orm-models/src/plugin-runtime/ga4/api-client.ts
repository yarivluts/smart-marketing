import type { Ga4RunReportResponse } from './types';

export interface Ga4RunReportParams {
  /** Canonical GA4 resource name, e.g. `properties/123456789` — stored verbatim in the install's `ga4_property_id` config field. */
  propertyId: string;
  /** A single calendar day (`YYYY-MM-DD`, UTC) — every report this connector requests is scoped to exactly one day, never a range. */
  date: string;
  dimensions: readonly string[];
  metrics: readonly string[];
}

export class Ga4ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'Ga4ApiError';
  }
}

/**
 * The GA4 Data API call this connector needs, kept as a small interface (not
 * the `googleapis` npm SDK) so a run's own executor can be driven by a fake
 * client in tests without any network access — the same seam
 * `StripeApiClient` (KAN-49) already established.
 */
export interface Ga4ApiClient {
  runReport(params: Ga4RunReportParams): Promise<Ga4RunReportResponse>;
}

const GA4_DATA_API_BASE_URL = 'https://analyticsdata.googleapis.com/v1beta';

/**
 * The real GA4 Data API client — plain `fetch` against Google's documented
 * REST endpoint with bearer OAuth2 access-token auth, no SDK dependency.
 * Every automated test in this repo drives the executor with a fake
 * {@link Ga4ApiClient} instead, since there is no real GA4 property reachable
 * from CI (KAN-52's AC bar — "sessions per day match the GA4 UI within
 * sampling tolerance" — is deferred until one exists, the same posture
 * KAN-49/50/51's own accuracy bars already carry).
 */
export class Ga4HttpApiClient implements Ga4ApiClient {
  constructor(private readonly accessToken: string) {}

  async runReport(params: Ga4RunReportParams): Promise<Ga4RunReportResponse> {
    const response = await fetch(`${GA4_DATA_API_BASE_URL}/${params.propertyId}:runReport`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: params.date, endDate: params.date }],
        dimensions: params.dimensions.map((name) => ({ name })),
        metrics: params.metrics.map((name) => ({ name })),
      }),
    });
    if (!response.ok) {
      throw new Ga4ApiError(`GA4 Data API runReport request failed with status ${response.status}`, response.status);
    }
    return (await response.json()) as Ga4RunReportResponse;
  }
}
