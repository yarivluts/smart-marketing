import type { BoardTile } from '../../models/board.model';
import { ensurePackDefaultBoardsSeeded, type EnsurePackDefaultBoardsSeededResult } from '../default-board-seeding';
import { SAAS_METRIC_PACK_PLUGIN_ID } from './manifest';

/** One board this pack seeds on install. `name` is also this function's own idempotency key — see {@link ensureSaasMetricPackDefaultBoardsSeeded}. */
export interface SaasMetricPackDefaultBoard {
  name: string;
  tiles: readonly BoardTile[];
}

/**
 * KAN-61 (plan `13 §E11.3`): "Marketing" — the acquisition-spend half of the
 * pack's metrics (plan `04 §3`'s own "TROI, acquisition cohort, campaying,
 * spend distribution, FB CPS" row). `ad_spend`'s own registered dimensions
 * (`metrics.ts`) are the ad hierarchy (`channel_id`/`campaign_id`/`adset_id`/
 * `ad_id`) — broken down by `channel_id` here, the coarsest useful slice for
 * a default board a human hasn't customized yet.
 */
const MARKETING_BOARD: SaasMetricPackDefaultBoard = {
  name: 'Marketing',
  tiles: [
    { id: 'marketing-ad-spend-line', type: 'line', title: 'Ad spend', layout: { x: 0, y: 0, w: 6, h: 4 }, metricNames: ['ad_spend'], dimensions: [] },
    {
      id: 'marketing-ad-spend-by-channel-bar',
      type: 'bar',
      title: 'Ad spend by channel',
      layout: { x: 6, y: 0, w: 6, h: 4 },
      metricNames: ['ad_spend'],
      dimensions: ['channel_id'],
    },
    {
      id: 'marketing-cost-per-signup-big-number',
      type: 'big_number',
      title: 'Cost per signup',
      layout: { x: 0, y: 4, w: 4, h: 3 },
      metricNames: ['cost_per_signup'],
      dimensions: [],
    },
    { id: 'marketing-cac-big-number', type: 'big_number', title: 'CAC', layout: { x: 4, y: 4, w: 4, h: 3 }, metricNames: ['cac'], dimensions: [] },
    { id: 'marketing-troi-big-number', type: 'big_number', title: 'TROI', layout: { x: 8, y: 4, w: 4, h: 3 }, metricNames: ['troi'], dimensions: [] },
    { id: 'marketing-signups-line', type: 'line', title: 'Signups', layout: { x: 0, y: 7, w: 12, h: 4 }, metricNames: ['signups'], dimensions: [] },
  ],
};

/**
 * KAN-61: "Revenue/MRR" — the billing/subscription half of the pack (plan
 * `04 §3`'s "MRR growth, cohort, net/gross churn ... pyramid" row).
 * `mrr_movements` is broken down by its own `type` dimension (new/upgrade/
 * downgrade — see `metrics.ts`'s own doc comment on that mapping) for the
 * bar tile and by `plan` for the table, both real dimensions this metric
 * declares.
 */
const REVENUE_MRR_BOARD: SaasMetricPackDefaultBoard = {
  name: 'Revenue / MRR',
  tiles: [
    { id: 'revenue-mrr-line', type: 'line', title: 'MRR', layout: { x: 0, y: 0, w: 6, h: 4 }, metricNames: ['mrr'], dimensions: [] },
    {
      id: 'revenue-mrr-movements-bar',
      type: 'bar',
      title: 'MRR movements',
      layout: { x: 6, y: 0, w: 6, h: 4 },
      metricNames: ['mrr_movements'],
      dimensions: ['type'],
    },
    {
      id: 'revenue-net-mrr-churn-big-number',
      type: 'big_number',
      title: 'Net MRR churn',
      layout: { x: 0, y: 4, w: 4, h: 3 },
      metricNames: ['net_mrr_churn'],
      dimensions: [],
    },
    {
      id: 'revenue-failed-charge-rate-big-number',
      type: 'big_number',
      title: 'Failed charge rate',
      layout: { x: 4, y: 4, w: 4, h: 3 },
      metricNames: ['failed_charge_rate'],
      dimensions: [],
    },
    {
      id: 'revenue-collected-revenue-big-number',
      type: 'big_number',
      title: 'Collected revenue',
      layout: { x: 8, y: 4, w: 4, h: 3 },
      metricNames: ['collected_revenue'],
      dimensions: [],
    },
    {
      id: 'revenue-mrr-movements-by-plan-table',
      type: 'table',
      title: 'MRR movements by plan',
      layout: { x: 0, y: 7, w: 12, h: 4 },
      metricNames: ['mrr_movements'],
      dimensions: ['plan'],
    },
  ],
};

/**
 * KAN-61: "Funnel" — the paying-conversion half of the pack (plan `04 §3`'s
 * "Paying accounts growth, conversion-to-paying" row). The `funnel` tile's
 * two ordered steps are `signups` then `new_paying` — both registered by
 * this pack (`metrics.ts`), even though `new_paying` isn't one of KAN-59's
 * eleven AC-named "featured" metrics: it's exactly the supporting
 * aggregation `cac`/`conversion_to_paying` already lean on, and the natural
 * second step of this funnel. `funnel` tiles ignore `dimensions` (see
 * `BoardTile`'s own doc comment — they break down by step, not by
 * dimension), so it's `[]` here same as every other non-breakdown tile
 * below.
 */
const FUNNEL_BOARD: SaasMetricPackDefaultBoard = {
  name: 'Funnel',
  tiles: [
    {
      id: 'funnel-signup-to-paying-funnel',
      type: 'funnel',
      title: 'Signup → paying funnel',
      layout: { x: 0, y: 0, w: 12, h: 5 },
      metricNames: ['signups', 'new_paying'],
      dimensions: [],
    },
    {
      id: 'funnel-conversion-to-paying-big-number',
      type: 'big_number',
      title: 'Conversion to paying',
      layout: { x: 0, y: 5, w: 4, h: 3 },
      metricNames: ['conversion_to_paying'],
      dimensions: [],
    },
    {
      id: 'funnel-cost-per-signup-big-number',
      type: 'big_number',
      title: 'Cost per signup',
      layout: { x: 4, y: 5, w: 4, h: 3 },
      metricNames: ['cost_per_signup'],
      dimensions: [],
    },
    { id: 'funnel-cac-big-number', type: 'big_number', title: 'CAC', layout: { x: 8, y: 5, w: 4, h: 3 }, metricNames: ['cac'], dimensions: [] },
    {
      id: 'funnel-signups-line',
      type: 'line',
      title: 'Signups over time',
      layout: { x: 0, y: 8, w: 12, h: 4 },
      metricNames: ['signups'],
      dimensions: [],
    },
  ],
};

/** The three boards KAN-59's own AC names by vertical: "Marketing, Revenue/MRR, Funnel" (plan `13 §E11.3`). */
export const SAAS_METRIC_PACK_DEFAULT_BOARDS: readonly SaasMetricPackDefaultBoard[] = [MARKETING_BOARD, REVENUE_MRR_BOARD, FUNNEL_BOARD];

export type EnsureSaasMetricPackDefaultBoardsSeededResult = EnsurePackDefaultBoardsSeededResult;

/**
 * Idempotently seeds this pack's three default boards (KAN-61, plan
 * `13 §E11.3`: "New project with pack installed shows populated boards
 * after first sync" — this pack has no sync/run concept, so "after
 * install", same posture `ensureSaasMetricPackRegistered` already takes for
 * "after first sync" in its own metric-registration half). Must run *after*
 * {@link ensureSaasMetricPackRegistered} (see `./index.ts`) — every tile
 * above references a metric name that only exists in the project's active
 * catalog once that call has registered it, and `saveBoardTiles` rejects a
 * tile referencing an unregistered metric.
 *
 * Thin wrapper over the shared {@link ensurePackDefaultBoardsSeeded} — see
 * that function's own doc comment for the create/repair/leave-alone
 * semantics (a board a human created directly under one of these exact
 * names is always left completely untouched; only a board this pack itself
 * created and never finished populating gets repaired on a later call).
 */
export async function ensureSaasMetricPackDefaultBoardsSeeded(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureSaasMetricPackDefaultBoardsSeededResult> {
  return ensurePackDefaultBoardsSeeded(SAAS_METRIC_PACK_PLUGIN_ID, SAAS_METRIC_PACK_DEFAULT_BOARDS, organizationId, projectId, createdByUserId);
}
