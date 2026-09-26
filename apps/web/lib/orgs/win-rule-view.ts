import type { WinEventModel, WinRuleModel } from '@growthos/firebase-orm-models';
import type { WinRuleFilter, WinType } from '@growthos/shared';
import type { FlowEdgeSpec, FlowNodeSpec } from '@/components/viz';
import { bucketByPeriod, earliestTimestamp, type PeriodBucket } from './period-buckets';

/** A win rule's own admin-list/edit-form shape — never sends the full `@arbel/firebase-orm` model instance to a client component. */
export interface WinRuleSummaryView {
  id: string;
  name: string;
  schemaName: string;
  filters: WinRuleFilter[];
  winType: WinType;
  active: boolean;
  createdAt: string;
}

export function toWinRuleSummaryView(rule: WinRuleModel): WinRuleSummaryView {
  return {
    id: rule.id,
    name: rule.name,
    schemaName: rule.schema_name,
    filters: rule.filters,
    winType: rule.win_type,
    active: rule.active,
    createdAt: rule.created_at,
  };
}

/** One fired win, as rendered in the live feed (and the feed's SSE push payload — see `feed/route.ts`). */
export interface WinEventFeedItem {
  id: string;
  /** The rule that fired it - names can be edited or repeated, so per-rule counts key on this. */
  winRuleId: string;
  winRuleName: string;
  winType: WinType;
  schemaName: string;
  clientId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export function toWinEventFeedItem(event: WinEventModel): WinEventFeedItem {
  return {
    id: event.id,
    winRuleId: event.win_rule_id,
    winRuleName: event.win_rule_name,
    winType: event.win_type,
    schemaName: event.schema_name,
    clientId: event.client_id,
    payload: event.payload,
    occurredAt: event.occurred_at,
    createdAt: event.created_at,
  };
}

/** How many of the given (recent) wins each rule fired, keyed by rule id. */
export function countWinsByRule(events: readonly Pick<WinEventFeedItem, 'winRuleId'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.winRuleId, (counts.get(event.winRuleId) ?? 0) + 1);
  }
  return counts;
}

export interface WinTrend {
  buckets: PeriodBucket[];
  /** Set when the history read was truncated: days before this were never read and are `null`. */
  reliableFrom: string | null;
}

/**
 * Wins per UTC day over the last `days` days, from the capped recent-wins read. That read is ordered
 * by `created_at`, so when it was truncated the days before its oldest row are unknown, not empty.
 */
export function toWinTrend(events: readonly Pick<WinEventFeedItem, 'createdAt'>[], options: { now: Date; days: number; truncated: boolean }): WinTrend {
  const reliableFrom = options.truncated ? earliestTimestamp(events.map((event) => event.createdAt)) : null;
  return {
    buckets: bucketByPeriod(
      events.map((event) => ({ at: event.createdAt })),
      { period: 'day', periods: options.days, now: options.now, reliableFrom },
    ),
    reliableFrom,
  };
}

export interface WinRuleFlowLabels {
  /** The single action node every rule feeds: the win feed / war-room TV. */
  action: string;
  actionSublabel: string;
  schemaSublabel: string;
  inactive: string;
  formatWins: (count: number) => string;
  /** Where clicking a schema node goes, e.g. that schema's records in the record feed. */
  schemaHref?: (schemaName: string) => string;
}

/**
 * Trigger -> rule -> action: each event schema a rule listens on, each rule (with how many of the
 * recent wins it fired), and the win feed they all post to. A disabled rule is drawn idle with no
 * edge into the feed, because it does not fire; an active rule's edge animates once it has fired.
 */
export function buildWinRuleFlow(
  rules: readonly Pick<WinRuleSummaryView, 'id' | 'name' | 'schemaName' | 'active'>[],
  winCounts: ReadonlyMap<string, number>,
  labels: WinRuleFlowLabels,
): { nodes: FlowNodeSpec[]; edges: FlowEdgeSpec[] } {
  const schemaNames = [...new Set(rules.map((rule) => rule.schemaName))];
  const totalWins = rules.reduce((sum, rule) => sum + (winCounts.get(rule.id) ?? 0), 0);
  const nodes: FlowNodeSpec[] = [
    ...schemaNames.map((schemaName): FlowNodeSpec => ({
      id: `schema:${schemaName}`,
      label: schemaName,
      sublabel: labels.schemaSublabel,
      status: 'idle',
      href: labels.schemaHref?.(schemaName),
    })),
    ...rules.map((rule): FlowNodeSpec => {
      const wins = winCounts.get(rule.id) ?? 0;
      return {
        id: `rule:${rule.id}`,
        label: rule.name,
        value: labels.formatWins(wins),
        sublabel: rule.active ? undefined : labels.inactive,
        status: !rule.active ? 'idle' : wins > 0 ? 'ok' : 'warn',
      };
    }),
    { id: 'action:feed', label: labels.action, sublabel: labels.actionSublabel, value: labels.formatWins(totalWins), status: totalWins > 0 ? 'ok' : 'idle' },
  ];
  const edges: FlowEdgeSpec[] = rules.flatMap((rule): FlowEdgeSpec[] => {
    const wins = winCounts.get(rule.id) ?? 0;
    const trigger: FlowEdgeSpec = { source: `schema:${rule.schemaName}`, target: `rule:${rule.id}`, status: rule.active ? 'ok' : 'idle' };
    return rule.active ? [trigger, { source: `rule:${rule.id}`, target: 'action:feed', status: wins > 0 ? 'ok' : 'idle', animated: wins > 0 }] : [trigger];
  });
  return { nodes, edges };
}
