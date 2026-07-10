import { GA4_EVENT_EVENT_NAME, GA4_SESSION_EVENT_NAME } from './schemas';
import type { Ga4ReportHeader, Ga4ReportRow, Ga4RunReportResponse } from './types';

/** Requested in every `sessions` report — see `executor.ts` for why `date` itself is never requested as a report dimension (the caller already knows the day; GA4's own `date` dimension uses an 8-digit `YYYYMMDD` format that would need re-parsing for no benefit). */
export const GA4_SESSION_REPORT_DIMENSIONS = ['sessionSource', 'sessionMedium', 'sessionCampaignName', 'sessionDefaultChannelGroup'] as const;
export const GA4_SESSION_REPORT_METRICS = ['sessions', 'engagedSessions', 'newUsers', 'totalUsers'] as const;

export const GA4_EVENT_REPORT_DIMENSIONS = ['eventName', 'sessionDefaultChannelGroup'] as const;
export const GA4_EVENT_REPORT_METRICS = ['eventCount', 'totalUsers'] as const;

function dimensionValue(headers: readonly Ga4ReportHeader[], row: Ga4ReportRow, name: string): string {
  const index = headers.findIndex((header) => header.name === name);
  return index >= 0 ? (row.dimensionValues[index]?.value ?? '') : '';
}

function metricValue(headers: readonly Ga4ReportHeader[], row: Ga4ReportRow, name: string): number {
  const index = headers.findIndex((header) => header.name === name);
  return index >= 0 ? Number(row.metricValues[index]?.value ?? 0) : 0;
}

/**
 * GA4 reports have no row-level id to dedup on, so `event_id` is built from
 * the row's own dimension values instead. Those values are free text a
 * marketer fully controls (a UTM campaign name, a referrer domain) and can
 * legitimately contain `:` — naively colon-joining them could let two
 * genuinely different rows collide onto the same `event_id` (e.g.
 * `source="google:ads", medium="cpc"` vs. `source="google", medium="ads:cpc"`),
 * which `ingestBatch`'s dedup would then silently discard one of as a
 * "duplicate". `JSON.stringify` on the tuple is unambiguous — it quotes and
 * escapes each element, so no two distinct tuples can serialize to the same
 * string — while still being deterministic across repeated syncs of the same
 * day, which dedup depends on.
 */
function dimensionKey(parts: readonly string[]): string {
  return JSON.stringify(parts);
}

/** Maps one day's `sessions` report to `ga4_session` event records — one per `(source, medium, campaign, channel_group)` row GA4 returned for that day. */
export function mapSessionsReportToEventRecords(propertyId: string, date: string, response: Ga4RunReportResponse): Record<string, unknown>[] {
  const dimensionHeaders = response.dimensionHeaders ?? [];
  const metricHeaders = response.metricHeaders ?? [];
  return (response.rows ?? []).map((row) => {
    const source = dimensionValue(dimensionHeaders, row, 'sessionSource');
    const medium = dimensionValue(dimensionHeaders, row, 'sessionMedium');
    const campaign = dimensionValue(dimensionHeaders, row, 'sessionCampaignName');
    const channelGroup = dimensionValue(dimensionHeaders, row, 'sessionDefaultChannelGroup');
    return {
      event_id: `ga4:session:${propertyId}:${date}:${dimensionKey([source, medium, campaign, channelGroup])}`,
      event: GA4_SESSION_EVENT_NAME,
      ts: `${date}T00:00:00.000Z`,
      properties: {
        date,
        source,
        medium,
        campaign,
        channel_group: channelGroup,
        sessions: metricValue(metricHeaders, row, 'sessions'),
        engaged_sessions: metricValue(metricHeaders, row, 'engagedSessions'),
        new_users: metricValue(metricHeaders, row, 'newUsers'),
        total_users: metricValue(metricHeaders, row, 'totalUsers'),
      },
    };
  });
}

/** Maps one day's `events` report to `ga4_event` event records — one per `(eventName, channel_group)` row GA4 returned for that day. */
export function mapEventsReportToEventRecords(propertyId: string, date: string, response: Ga4RunReportResponse): Record<string, unknown>[] {
  const dimensionHeaders = response.dimensionHeaders ?? [];
  const metricHeaders = response.metricHeaders ?? [];
  return (response.rows ?? []).map((row) => {
    const eventName = dimensionValue(dimensionHeaders, row, 'eventName');
    const channelGroup = dimensionValue(dimensionHeaders, row, 'sessionDefaultChannelGroup');
    return {
      event_id: `ga4:event:${propertyId}:${date}:${dimensionKey([eventName, channelGroup])}`,
      event: GA4_EVENT_EVENT_NAME,
      ts: `${date}T00:00:00.000Z`,
      properties: {
        date,
        event_name: eventName,
        channel_group: channelGroup,
        event_count: metricValue(metricHeaders, row, 'eventCount'),
        total_users: metricValue(metricHeaders, row, 'totalUsers'),
      },
    };
  });
}
