/**
 * Minimal GA4 Data API (`analyticsdata.googleapis.com/v1beta`) shapes
 * (KAN-52, plan `13 §E8.4`) — only the fields this connector actually reads,
 * not a full mirror of Google's API. Kept independent of any Google client
 * library (not a dependency of this package) so the connector stays a small,
 * provider-agnostic-interface consumer of plain JSON, the same
 * "buildable-today, swap the provider later" posture the Stripe connector
 * (KAN-49) already established for its own external-system seam.
 */

/** One dimension/metric header GA4 echoes back, naming which column of `rows` it is. */
export interface Ga4ReportHeader {
  name: string;
}

/** One report row — `dimensionValues`/`metricValues` are positional, matching `dimensionHeaders`/`metricHeaders` by index. */
export interface Ga4ReportRow {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

/** A `properties/{id}:runReport` response — `rows` is absent (not just empty) when a day has no data at all. */
export interface Ga4RunReportResponse {
  dimensionHeaders: Ga4ReportHeader[];
  metricHeaders: Ga4ReportHeader[];
  rows?: Ga4ReportRow[];
  rowCount?: number;
}
