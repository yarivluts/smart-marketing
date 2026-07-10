import { describe, expect, it } from 'vitest';
import { mapEventsReportToEventRecords, mapSessionsReportToEventRecords } from './mappers';
import type { Ga4RunReportResponse } from './types';

describe('mapSessionsReportToEventRecords', () => {
  it('maps one row per acquisition-dimension combo', () => {
    const response: Ga4RunReportResponse = {
      dimensionHeaders: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }, { name: 'sessionDefaultChannelGroup' }],
      metricHeaders: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'newUsers' }, { name: 'totalUsers' }],
      rows: [
        {
          dimensionValues: [{ value: 'google' }, { value: 'cpc' }, { value: 'summer_sale' }, { value: 'Paid Search' }],
          metricValues: [{ value: '120' }, { value: '80' }, { value: '30' }, { value: '100' }],
        },
      ],
    };

    const records = mapSessionsReportToEventRecords('properties/123', '2026-07-01', response);
    expect(records).toEqual([
      {
        event_id: 'ga4:session:properties/123:2026-07-01:["google","cpc","summer_sale","Paid Search"]',
        event: 'ga4_session',
        ts: '2026-07-01T00:00:00.000Z',
        properties: {
          date: '2026-07-01',
          source: 'google',
          medium: 'cpc',
          campaign: 'summer_sale',
          channel_group: 'Paid Search',
          sessions: 120,
          engaged_sessions: 80,
          new_users: 30,
          total_users: 100,
        },
      },
    ]);
  });

  it('returns an empty array when the report has no rows', () => {
    expect(mapSessionsReportToEventRecords('properties/123', '2026-07-01', { dimensionHeaders: [], metricHeaders: [] })).toEqual([]);
  });

  it('produces distinct event_ids for two rows whose free-text dimensions would collide under a naive colon join', () => {
    const dimensionHeaders = [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }, { name: 'sessionDefaultChannelGroup' }];
    const metricHeaders = [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'newUsers' }, { name: 'totalUsers' }];
    const response: Ga4RunReportResponse = {
      dimensionHeaders,
      metricHeaders,
      rows: [
        // "google:ads" / "cpc" vs. "google" / "ads:cpc" — `${a}:${b}` would collide on both rows.
        { dimensionValues: [{ value: 'google:ads' }, { value: 'cpc' }, { value: '' }, { value: 'Paid Search' }], metricValues: [{ value: '1' }, { value: '1' }, { value: '1' }, { value: '1' }] },
        { dimensionValues: [{ value: 'google' }, { value: 'ads:cpc' }, { value: '' }, { value: 'Paid Search' }], metricValues: [{ value: '2' }, { value: '2' }, { value: '2' }, { value: '2' }] },
      ],
    };

    const records = mapSessionsReportToEventRecords('properties/123', '2026-07-01', response);
    const eventIds = records.map((r) => r.event_id);
    expect(new Set(eventIds).size).toBe(2);
  });
});

describe('mapEventsReportToEventRecords', () => {
  it('maps one row per (eventName, channel_group) combo', () => {
    const response: Ga4RunReportResponse = {
      dimensionHeaders: [{ name: 'eventName' }, { name: 'sessionDefaultChannelGroup' }],
      metricHeaders: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      rows: [{ dimensionValues: [{ value: 'purchase' }, { value: 'Direct' }], metricValues: [{ value: '42' }, { value: '35' }] }],
    };

    const records = mapEventsReportToEventRecords('properties/123', '2026-07-01', response);
    expect(records).toEqual([
      {
        event_id: 'ga4:event:properties/123:2026-07-01:["purchase","Direct"]',
        event: 'ga4_event',
        ts: '2026-07-01T00:00:00.000Z',
        properties: { date: '2026-07-01', event_name: 'purchase', channel_group: 'Direct', event_count: 42, total_users: 35 },
      },
    ]);
  });
});
