import { describe, expect, it, vi } from 'vitest';
import type { Ga4ApiClient, Ga4RunReportParams } from './api-client';
import { Ga4ApiError } from './api-client';
import { Ga4SourcePluginExecutor } from './executor';
import { SourcePluginExecutionError } from '../executor';
import type { PluginRuntimeCredential } from '../credential';
import { parseGa4SyncCursor } from './cursor';

const CREDENTIAL: PluginRuntimeCredential = {
  token: 'fake-token',
  expiresAt: new Date().toISOString(),
  organizationId: 'org_1',
  projectId: 'proj_1',
  pluginInstallId: 'install_1',
  scopes: ['ingest:write'],
};

const EMPTY_REPORT = { dimensionHeaders: [], metricHeaders: [], rows: [] };
const NOW = () => new Date('2026-07-10T12:00:00.000Z');

function baseClient(overrides: Partial<Ga4ApiClient> = {}): Ga4ApiClient {
  return {
    runReport: vi.fn().mockResolvedValue(EMPTY_REPORT),
    ...overrides,
  };
}

function syncParams(cursor: string | null, client: Ga4ApiClient, backfillDays = 5) {
  return {
    executor: new Ga4SourcePluginExecutor({ apiClient: client, propertyId: 'properties/123', backfillDays, now: NOW }),
    cursor,
  };
}

function callArgs(runReport: ReturnType<typeof vi.fn>): Ga4RunReportParams[] {
  return runReport.mock.calls.map((call) => call[0] as Ga4RunReportParams);
}

describe('Ga4SourcePluginExecutor', () => {
  it('fetches both the sessions and events report for the same day on a from-scratch sync', async () => {
    const runReport = vi.fn().mockResolvedValue(EMPTY_REPORT);
    const { executor } = syncParams(null, baseClient({ runReport }), 5);
    const result = await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.ga4', config: {}, credential: CREDENTIAL, cursor: null });

    expect(result.kind).toBe('event');
    const args = callArgs(runReport);
    expect(args).toHaveLength(2);
    // backfillDays=5 from "today" 2026-07-10 -> start date 2026-07-05.
    expect(args.every((call) => call.date === '2026-07-05')).toBe(true);
    expect(args.map((call) => call.propertyId)).toEqual(['properties/123', 'properties/123']);
  });

  it('walks the cursor forward one day per call while backfilling', async () => {
    const runReport = vi.fn().mockResolvedValue(EMPTY_REPORT);
    const first = await new Ga4SourcePluginExecutor({ apiClient: { runReport }, propertyId: 'properties/123', backfillDays: 3, now: NOW }).sync({
      organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: null,
    });
    const cursor1 = parseGa4SyncCursor(first.nextCursor, '2026-07-10', 3);
    expect(cursor1.sessions).toEqual({ nextDate: '2026-07-08', backfillComplete: false });

    const second = await new Ga4SourcePluginExecutor({ apiClient: { runReport }, propertyId: 'properties/123', backfillDays: 3, now: NOW }).sync({
      organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: first.nextCursor,
    });
    const cursor2 = parseGa4SyncCursor(second.nextCursor, '2026-07-10', 3);
    expect(cursor2.sessions).toEqual({ nextDate: '2026-07-09', backfillComplete: false });

    const args = callArgs(runReport);
    expect(args[0].date).toBe('2026-07-07');
    expect(args[2].date).toBe('2026-07-08');
  });

  it('reaches backfillComplete once it fetches yesterday, then re-polls yesterday on every subsequent call', async () => {
    const runReport = vi.fn().mockResolvedValue(EMPTY_REPORT);
    // backfillDays=1 -> starts at yesterday (2026-07-09) already, one call away from done.
    const { executor } = syncParams(null, { runReport }, 1);
    const first = await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: null });
    const cursor1 = parseGa4SyncCursor(first.nextCursor, '2026-07-10', 1);
    expect(cursor1.sessions).toEqual({ nextDate: '2026-07-09', backfillComplete: true });

    const second = await new Ga4SourcePluginExecutor({ apiClient: { runReport }, propertyId: 'properties/123', backfillDays: 1, now: NOW }).sync({
      organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: first.nextCursor,
    });
    const cursor2 = parseGa4SyncCursor(second.nextCursor, '2026-07-10', 1);
    expect(cursor2.sessions).toEqual({ nextDate: '2026-07-09', backfillComplete: true });

    const args = callArgs(runReport);
    expect(args.every((call) => call.date === '2026-07-09')).toBe(true);
  });

  it('maps report rows into ga4_session and ga4_event records in one result', async () => {
    const sessionsReport = {
      dimensionHeaders: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }, { name: 'sessionDefaultChannelGroup' }],
      metricHeaders: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'newUsers' }, { name: 'totalUsers' }],
      rows: [{ dimensionValues: [{ value: 'google' }, { value: 'cpc' }, { value: '' }, { value: 'Paid Search' }], metricValues: [{ value: '10' }, { value: '8' }, { value: '3' }, { value: '9' }] }],
    };
    const eventsReport = {
      dimensionHeaders: [{ name: 'eventName' }, { name: 'sessionDefaultChannelGroup' }],
      metricHeaders: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      rows: [{ dimensionValues: [{ value: 'purchase' }, { value: 'Direct' }], metricValues: [{ value: '4' }, { value: '3' }] }],
    };
    const runReport = vi.fn().mockImplementation((params: Ga4RunReportParams) =>
      Promise.resolve(params.dimensions.includes('eventName') ? eventsReport : sessionsReport),
    );
    const { executor } = syncParams(null, { runReport }, 5);
    const result = await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: null });

    expect(result.records.map((r) => r.event)).toEqual(['ga4_session', 'ga4_event']);
  });

  it('wraps a Ga4ApiError as SourcePluginExecutionError so the generic retry/backoff loop can act on it', async () => {
    const runReport = vi.fn().mockRejectedValue(new Ga4ApiError('rate limited', 429));
    const { executor } = syncParams(null, { runReport });
    await expect(
      executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: null }),
    ).rejects.toBeInstanceOf(SourcePluginExecutionError);
  });

  it('rejects a malformed persisted cursor rather than silently starting over', async () => {
    const { executor } = syncParams('not-json', baseClient());
    await expect(
      executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: 'not-json' }),
    ).rejects.toThrow();
  });
});
