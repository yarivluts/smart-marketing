import { SourcePluginExecutionError, type SourcePluginExecutor, type SourcePluginSyncParams, type SourcePluginSyncResult } from '../executor';
import { Ga4ApiError, type Ga4ApiClient } from './api-client';
import {
  addDaysUtc,
  DEFAULT_GA4_BACKFILL_DAYS,
  initialGa4SyncCursor,
  parseGa4SyncCursor,
  serializeGa4SyncCursor,
  toDateString,
  type Ga4ResourceCursor,
} from './cursor';
import {
  GA4_EVENT_REPORT_DIMENSIONS,
  GA4_EVENT_REPORT_METRICS,
  GA4_SESSION_REPORT_DIMENSIONS,
  GA4_SESSION_REPORT_METRICS,
  mapEventsReportToEventRecords,
  mapSessionsReportToEventRecords,
} from './mappers';
import type { Ga4RunReportResponse } from './types';

const NOTHING_TO_SYNC_YET: Ga4RunReportResponse = { dimensionHeaders: [], metricHeaders: [] };

/**
 * One report's own single-day fetch + cursor advance. Walks `nextDate`
 * forward exactly one calendar day per call, whether it's still catching up
 * from a fresh install or recovering from a gap between manual "Run now"
 * clicks — see `cursor.ts`'s own doc comment for why a day is fetched at
 * most once, ever. Once `nextDate` has caught up to (or past) `yesterday`,
 * there is nothing new to sync yet this call — skipped without an API call,
 * not re-fetched.
 */
async function syncResourceDay(
  cursor: Ga4ResourceCursor,
  yesterday: string,
  fetchDay: (date: string) => Promise<Ga4RunReportResponse>,
): Promise<{ response: Ga4RunReportResponse; date: string; cursor: Ga4ResourceCursor }> {
  if (cursor.nextDate > yesterday) {
    return { response: NOTHING_TO_SYNC_YET, date: cursor.nextDate, cursor };
  }

  const response = await fetchDay(cursor.nextDate);
  return { response, date: cursor.nextDate, cursor: { nextDate: addDaysUtc(cursor.nextDate, 1) } };
}

export interface Ga4SourcePluginExecutorOptions {
  apiClient: Ga4ApiClient;
  /** The GA4 property this install syncs, e.g. `properties/123456789` — resolved once from the install's `ga4_property_id` config and baked in here, the same "everything the client needs is baked in at construction" posture `StripeSourcePluginExecutor` already established (it never reads `SourcePluginSyncParams.config` either). */
  propertyId: string;
  /** Defaults to {@link DEFAULT_GA4_BACKFILL_DAYS} — overridable so tests can exercise a short backfill window without huge fixtures. */
  backfillDays?: number;
  /** Defaults to the real clock — overridable so tests can pin "today" instead of depending on the wall clock. */
  now?: () => Date;
}

/**
 * The real GA4 source-plugin executor (KAN-52, plan `13 §E8.4`: "sessions,
 * events, UTM ... capture"). GA4's Data API reports are aggregated
 * day-by-day rollups (dimensioned by acquisition source/medium/campaign/
 * channel group), not a raw per-user event stream — a real per-hit click-id
 * (gclid/fbclid) capture would need GA4's BigQuery export, deferred until
 * KAN-18 provisions a real GCP project the same way the plan doc itself
 * frames this story as "via BigQuery export **or** Data API". This connector
 * takes the Data API path and captures UTM-equivalent acquisition dimensions
 * (`source`/`medium`/`campaign`/`channel_group`), not raw click ids — a
 * documented, deliberate scope narrowing, not a gap discovered later.
 *
 * Unlike `StripeSourcePluginExecutor`, there is no phase alternation: both
 * reports this connector fetches (`sessions`, `events`) land as
 * `kind: 'event'`, so every `sync()` call fetches one day of both reports
 * together (see `cursor.ts`'s own doc comment for why no `phase` field is
 * needed).
 */
export class Ga4SourcePluginExecutor implements SourcePluginExecutor {
  private readonly apiClient: Ga4ApiClient;
  private readonly propertyId: string;
  private readonly backfillDays: number;
  private readonly now: () => Date;

  constructor(options: Ga4SourcePluginExecutorOptions) {
    this.apiClient = options.apiClient;
    this.propertyId = options.propertyId;
    this.backfillDays = options.backfillDays ?? DEFAULT_GA4_BACKFILL_DAYS;
    this.now = options.now ?? (() => new Date());
  }

  async sync(params: SourcePluginSyncParams): Promise<SourcePluginSyncResult> {
    const today = toDateString(this.now());
    const yesterday = addDaysUtc(today, -1);
    const cursor = params.cursor === null ? initialGa4SyncCursor(today, this.backfillDays) : parseGa4SyncCursor(params.cursor, today, this.backfillDays);

    try {
      const [sessions, events] = await Promise.all([
        syncResourceDay(cursor.sessions, yesterday, (date) =>
          this.apiClient.runReport({ propertyId: this.propertyId, date, dimensions: GA4_SESSION_REPORT_DIMENSIONS, metrics: GA4_SESSION_REPORT_METRICS }),
        ),
        syncResourceDay(cursor.events, yesterday, (date) =>
          this.apiClient.runReport({ propertyId: this.propertyId, date, dimensions: GA4_EVENT_REPORT_DIMENSIONS, metrics: GA4_EVENT_REPORT_METRICS }),
        ),
      ]);

      const records = [
        ...mapSessionsReportToEventRecords(this.propertyId, sessions.date, sessions.response),
        ...mapEventsReportToEventRecords(this.propertyId, events.date, events.response),
      ];

      return {
        kind: 'event',
        records,
        nextCursor: serializeGa4SyncCursor({ sessions: sessions.cursor, events: events.cursor }),
      };
    } catch (error) {
      if (error instanceof Ga4ApiError) {
        throw new SourcePluginExecutionError(error.message);
      }
      throw error;
    }
  }
}
