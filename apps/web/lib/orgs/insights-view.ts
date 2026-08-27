import type { TrackingAlertModel, WinEventModel } from '@growthos/firebase-orm-models';

/**
 * The project-scoped "Insights" page's own merge of the two per-project
 * "here is something noteworthy" feeds — active tracking-broke episodes
 * (KAN-36) and fired win-rule events (KAN-65/66) — mirroring the MCP
 * server's own `list_insights` tool (`listProjectInsights`,
 * `mcp-tools.service.ts`), which fans out to the exact same two sources.
 *
 * Deliberately does NOT reuse `listProjectInsights`'s own `title`/`detail`
 * strings: those are pre-rendered English sentences meant for an LLM
 * consumer, not translatable UI copy, so reusing them here would violate
 * CLAUDE.md's "no hard-coded UI strings" rule. Instead this rebuilds the
 * same merge (newest-first by the alert's `detected_at` / the win's
 * `occurred_at`, capped to `limit`) straight from the two underlying model
 * lists, so the page can render each kind's own translated template.
 */

export type InsightSeverity = 'warning' | 'info';

export interface TrackingAlertInsightView {
  kind: 'tracking_alert';
  id: string;
  schemaName: string;
  lastSeenAt: string;
  occurredAt: string;
  severity: 'warning';
}

export interface WinEventInsightView {
  kind: 'win_event';
  id: string;
  winRuleName: string;
  schemaName: string;
  clientId: string;
  occurredAt: string;
  severity: 'info';
}

export type InsightView = TrackingAlertInsightView | WinEventInsightView;

const DEFAULT_INSIGHTS_VIEW_LIMIT = 20;

export function buildInsightsView(
  alerts: readonly TrackingAlertModel[],
  wins: readonly WinEventModel[],
  limit: number = DEFAULT_INSIGHTS_VIEW_LIMIT,
): InsightView[] {
  const alertViews: InsightView[] = alerts.map((alert) => ({
    kind: 'tracking_alert',
    id: alert.id,
    schemaName: alert.schema_name,
    lastSeenAt: alert.last_seen_at,
    occurredAt: alert.detected_at,
    severity: 'warning',
  }));

  const winViews: InsightView[] = wins.map((win) => ({
    kind: 'win_event',
    id: win.id,
    winRuleName: win.win_rule_name,
    schemaName: win.schema_name,
    clientId: win.client_id,
    occurredAt: win.occurred_at,
    severity: 'info',
  }));

  return [...alertViews, ...winViews]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit);
}
