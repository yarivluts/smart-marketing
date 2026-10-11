import type { ParsedMetricUnit } from '@growthos/shared';
import type { FlowEdgeSpec, FlowNodeSpec } from '@/components/viz/flow-diagram';
import type { VizStatus } from '@/components/viz/palette';
import type { VizValueFormat } from '@/components/viz/format';
import type { CohortHeatmapRow, FunnelStepItem, UnifiedGoalItem } from './funnel-goals-synthesizer';
import type { InsightView } from './insights-view';
import type { CustomerSearchEntryView } from './customer-search-view';
import type { SegmentMemberCountView, SegmentSummaryView } from './segment-view';

/*
  Chart-data shaping for the growth pages (Funnel & Goals hub, Goals, Insights, Customers,
  Segments). Every function here only re-arranges numbers the page already measured - none of them
  fills a gap with an estimate. Where a figure is missing the output says so (an empty list, a
  `null`), and the page shows an empty state instead of a chart.
*/

/** How bad a step's drop-off is: half or more of the previous step lost is an error, a fifth a warning. */
export function funnelDropOffStatus(dropOffPercent: number): VizStatus {
  if (dropOffPercent >= 50) return 'error';
  if (dropOffPercent >= 20) return 'warn';
  return 'ok';
}

/** A funnel step's short, unique axis label: its position plus the event it counts. Stage keys repeat (KAN-199), event names rarely do. */
export function funnelStepLabel(step: Pick<FunnelStepItem, 'stepOrder' | 'stageLabel' | 'eventSchemaName'>): string {
  return `${step.stepOrder}. ${step.eventSchemaName ?? step.stageLabel}`;
}

export interface FunnelFlowText {
  people: (count: number) => string;
  conversion: (percent: number) => string;
  dropOff: (percent: number) => string;
}

/**
 * The funnel as a left-to-right flow: one node per step (its people count, coloured by the drop-off
 * that reached it) and one edge per transition, labelled with the share of people lost on it.
 */
export function buildFunnelFlow(steps: readonly FunnelStepItem[], text: FunnelFlowText): { nodes: FlowNodeSpec[]; edges: FlowEdgeSpec[] } {
  const ordered = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const nodes: FlowNodeSpec[] = ordered.map((step, index) => ({
    id: `step-${step.stepOrder}`,
    // The event is what tells steps apart (several can share a stage); the stage rides along below it.
    label: step.eventSchemaName ?? step.stageLabel,
    sublabel: [step.eventSchemaName && step.eventSchemaName !== step.stageLabel ? step.stageLabel : null, text.conversion(step.conversionPercent)]
      .filter(Boolean)
      .join(' · '),
    value: text.people(step.customerCount),
    status: index === 0 ? (step.customerCount > 0 ? 'ok' : 'idle') : funnelDropOffStatus(step.dropOffPercent),
  }));
  const edges: FlowEdgeSpec[] = ordered.slice(1).map((step, index) => ({
    source: `step-${ordered[index].stepOrder}`,
    target: `step-${step.stepOrder}`,
    label: text.dropOff(step.dropOffPercent),
    status: funnelDropOffStatus(step.dropOffPercent),
  }));
  return { nodes, edges };
}

/** One row per step for the conversion chart: its share of the first step and its people count. */
export function buildFunnelConversionRows(steps: readonly FunnelStepItem[]): { step: string; conversion: number; people: number }[] {
  return [...steps]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((step) => ({ step: funnelStepLabel(step), conversion: step.conversionPercent, people: step.customerCount }));
}

/** People lost on each transition that lost anyone, biggest first - where to look before anything else. */
export function buildFunnelLosses(steps: readonly FunnelStepItem[]): { key: string; from: FunnelStepItem; to: FunnelStepItem; lost: number; percent: number }[] {
  const ordered = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  return ordered
    .slice(1)
    .map((step, index) => {
      const from = ordered[index];
      return { key: `${from.stepOrder}-${step.stepOrder}`, from, to: step, lost: Math.max(0, from.customerCount - step.customerCount), percent: step.dropOffPercent };
    })
    .filter((loss) => loss.lost > 0)
    .sort((a, b) => b.lost - a.lost);
}

export interface GoalStatusMix {
  on_track: number;
  at_risk: number;
  off_track: number;
  paused: number;
  /** Active goals whose progress could not be measured (no rows yet, warehouse unavailable, query failed). */
  unmeasured: number;
}

/** Every goal counted once: paused first (it has no pace), then its measured pace, else unmeasured. */
export function summarizeGoalStatusMix(goals: readonly Pick<UnifiedGoalItem, 'isPaused' | 'progressKind' | 'status'>[]): GoalStatusMix {
  const mix: GoalStatusMix = { on_track: 0, at_risk: 0, off_track: 0, paused: 0, unmeasured: 0 };
  for (const goal of goals) {
    if (goal.isPaused) mix.paused += 1;
    else if (goal.progressKind === 'ok' && goal.status) mix[goal.status] += 1;
    else mix.unmeasured += 1;
  }
  return mix;
}

/** The mean retention of every cohort that has reached each period - `null` for a period no cohort reached. */
export function averageRetentionCurve(rows: readonly CohortHeatmapRow[], periodNumbers: readonly number[]): { periodNumber: number; retention: number | null }[] {
  return periodNumbers.map((periodNumber) => {
    const rates = rows.flatMap((row) => {
      const cell = row.retentionByPeriod.get(periodNumber);
      return cell ? [cell.retentionRatePercent] : [];
    });
    return { periodNumber, retention: rates.length > 0 ? Math.round((rates.reduce((sum, rate) => sum + rate, 0) / rates.length) * 10) / 10 : null };
  });
}

/** The chart value format that shows a metric in its declared unit (KAN-213). A currency with no known code, a duration or a count read as plain numbers. */
export function vizFormatForMetricUnit(unit?: ParsedMetricUnit): VizValueFormat {
  if (!unit) return 'number';
  if (unit.kind === 'ratio') return 'ratio';
  if (unit.kind === 'percent') return 'percent';
  if (unit.kind === 'currency' && unit.currency) return { currency: unit.currency };
  return 'number';
}

export type InsightKind = 'tracking_alert' | 'win_event' | 'metric_health';

export function insightKind(insight: Pick<InsightView, 'titleKey'>): InsightKind {
  if (insight.titleKey === 'trackingAlertTitle') return 'tracking_alert';
  if (insight.titleKey === 'metricHealthTitle') return 'metric_health';
  return 'win_event';
}

export interface InsightSummary {
  total: number;
  warnings: number;
  info: number;
  byKind: Record<InsightKind, number>;
  latestAt: string | null;
}

export function summarizeInsights(insights: readonly InsightView[]): InsightSummary {
  const summary: InsightSummary = { total: insights.length, warnings: 0, info: 0, byKind: { tracking_alert: 0, win_event: 0, metric_health: 0 }, latestAt: null };
  for (const insight of insights) {
    if (insight.severity === 'warning') summary.warnings += 1;
    else summary.info += 1;
    summary.byKind[insightKind(insight)] += 1;
    if (summary.latestAt === null || insight.occurredAt > summary.latestAt) summary.latestAt = insight.occurredAt;
  }
  return summary;
}

/** Insights per UTC day (oldest first), split by severity. Only days that had an insight appear. */
export function insightsPerDay(insights: readonly InsightView[]): { day: string; warning: number; info: number }[] {
  const byDay = new Map<string, { warning: number; info: number }>();
  for (const insight of insights) {
    const day = insight.occurredAt.slice(0, 10);
    const entry = byDay.get(day) ?? { warning: 0, info: 0 };
    if (insight.severity === 'warning') entry.warning += 1;
    else entry.info += 1;
    byDay.set(day, entry);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, counts]) => ({ day, ...counts }));
}

/** Groups a feed by UTC day, newest day first, keeping each day's own order. */
export function groupInsightsByDay<T extends Pick<InsightView, 'occurredAt'>>(insights: readonly T[]): { day: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const insight of insights) {
    const day = insight.occurredAt.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), insight]);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([day, items]) => ({ day, items }));
}

/** How a set of search results splits across entity schemas, most matches first. */
export function customerSchemaBreakdown(entries: readonly Pick<CustomerSearchEntryView, 'schemaName'>[]): { schemaName: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.schemaName, (counts.get(entry.schemaName) ?? 0) + 1);
  return [...counts.entries()].map(([schemaName, count]) => ({ schemaName, count })).sort((a, b) => b.count - a.count || a.schemaName.localeCompare(b.schemaName));
}

export interface EntitySchemaOverview {
  schemaName: string;
  fieldCount: number;
  piiCount: number;
  identityKeys: string[];
  fields: { name: string; type: string; isPii: boolean; isIdentityKey: boolean }[];
}

/** What each registered entity schema declares - its fields, which are PII, which identify an entity. */
export function summarizeEntitySchemas(
  schemas: readonly { schemaName: string; fieldDefs: readonly { name: string; type: string; is_pii: boolean; is_identity_key: boolean }[] }[],
): EntitySchemaOverview[] {
  return schemas.map(({ schemaName, fieldDefs }) => ({
    schemaName,
    fieldCount: fieldDefs.length,
    piiCount: fieldDefs.filter((field) => field.is_pii).length,
    identityKeys: fieldDefs.filter((field) => field.is_identity_key).map((field) => field.name),
    fields: fieldDefs.map((field) => ({ name: field.name, type: field.type, isPii: field.is_pii, isIdentityKey: field.is_identity_key })),
  }));
}

/** The first non-PII, non-empty field value - what a result card leads with. Falls back to the entity id. */
export function customerDisplayName(entry: Pick<CustomerSearchEntryView, 'entityId' | 'fields'>): string {
  return entry.fields.find((field) => !field.isPii && field.value.trim() !== '')?.value ?? entry.entityId;
}

/** One or two letters to stand for an entity in its result card. */
export function entityInitials(value: string): string {
  const letters = value.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (letters.length === 0) return '#';
  if (letters.length === 1) return letters[0].slice(0, 2).toUpperCase();
  return `${letters[0][0]}${letters[1][0]}`.toUpperCase();
}

export interface SegmentSummaryStats {
  /** Sum of the member counts that were measured; null when none was. */
  totalMembers: number | null;
  measuredCount: number;
  /** The measured segment with the most members; null when none was measured or every measured one is empty. */
  largest: { id: string; name: string; count: number } | null;
  byStatus: Record<SegmentSummaryView['status'], number>;
}

export function summarizeSegments(
  segments: readonly Pick<SegmentSummaryView, 'id' | 'name' | 'status'>[],
  counts: ReadonlyMap<string, SegmentMemberCountView>,
): SegmentSummaryStats {
  const stats: SegmentSummaryStats = { totalMembers: null, measuredCount: 0, largest: null, byStatus: { open: 0, in_progress: 0, done: 0 } };
  for (const segment of segments) {
    stats.byStatus[segment.status] += 1;
    const view = counts.get(segment.id);
    if (view?.kind !== 'ok') continue;
    stats.measuredCount += 1;
    stats.totalMembers = (stats.totalMembers ?? 0) + view.count;
    // A segment with no members is not "the largest" of anything: with every segment empty, there is none.
    if (view.count > 0 && (!stats.largest || view.count > stats.largest.count)) stats.largest = { id: segment.id, name: segment.name, count: view.count };
  }
  return stats;
}

/**
 * The window a goal's metric trend is drawn over: from its start date to today, or to its deadline
 * once that has passed. `null` for a goal that has not started - there is nothing to draw yet.
 */
export function goalTrendWindow(goal: { start_date: string; deadline: string }, today: string): { start: string; end: string } | null {
  if (today < goal.start_date) return null;
  return { start: goal.start_date, end: today < goal.deadline ? today : goal.deadline };
}

/** A day-by-day line tile over one metric - the same query a board line tile runs, so the numbers match a board's. */
export function goalTrendTile(metricName: string): {
  id: string;
  type: 'line';
  title: string;
  layout: { x: number; y: number; w: number; h: number };
  metricNames: string[];
  dimensions: string[];
} {
  return { id: 'goal-metric-trend', type: 'line', title: metricName, layout: { x: 0, y: 0, w: 12, h: 4 }, metricNames: [metricName], dimensions: [] };
}

/** One chart row per measured day, oldest first. `null` values stay `null` (a gap, never a 0). */
export function goalTrendRows(points: readonly { bucket: string; value: number | null }[], formatDay: (day: string) => string): { day: string; value: number | null }[] {
  return [...points]
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
    .map((point) => ({ day: formatDay(point.bucket.slice(0, 10)), value: point.value }));
}

export interface GoalComparisonLabels {
  actual: string;
  expected: string;
  projected: string;
  target: string;
  rangeMin: string;
  rangeMax: string;
}

/**
 * Target vs actual, side by side: what was measured, what the pace expected by now, where the pace
 * lands at the deadline, and the target itself (both ends for a range goal). Only for a measured goal.
 */
export function goalComparisonRows(
  measured: { actualValue: number; expectedAtNow: number; projectedFinalValue: number },
  goal: { direction: string; target_value: number | null; range_min: number | null; range_max: number | null },
  labels: GoalComparisonLabels,
): { label: string; value: number }[] {
  const rows = [
    { label: labels.actual, value: measured.actualValue },
    { label: labels.expected, value: measured.expectedAtNow },
    { label: labels.projected, value: measured.projectedFinalValue },
  ];
  if (goal.direction === 'range') {
    if (goal.range_min !== null) rows.push({ label: labels.rangeMin, value: goal.range_min });
    if (goal.range_max !== null) rows.push({ label: labels.rangeMax, value: goal.range_max });
  } else if (goal.target_value !== null) {
    rows.push({ label: labels.target, value: goal.target_value });
  }
  return rows;
}
