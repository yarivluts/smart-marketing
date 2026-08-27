import type { ProjectInsight, ProjectInsightSeverity } from '@growthos/firebase-orm-models';

/**
 * Which `Insights` translation keys + interpolation args to render for one insight, and nothing
 * else — `ProjectInsight.title`/`.detail` are plain English text built for an MCP-connected AI
 * agent to read (see that type's own doc comment), never rendered here, so this page stays real
 * `next-intl` copy (en+he) rather than smuggling hard-coded English into the UI.
 */
export interface InsightView {
  id: string;
  severity: ProjectInsightSeverity;
  occurredAt: string;
  titleKey: 'trackingAlertTitle' | 'winEventTitle';
  detailKey: 'trackingAlertDetail' | 'winEventDetail';
  args: Record<string, string>;
}

export function toInsightView(insight: ProjectInsight): InsightView {
  if (insight.kind === 'tracking_alert') {
    return {
      id: insight.id,
      severity: insight.severity,
      occurredAt: insight.occurredAt,
      titleKey: 'trackingAlertTitle',
      detailKey: 'trackingAlertDetail',
      args: { schemaName: insight.schemaName, lastSeenAt: insight.lastSeenAt },
    };
  }
  return {
    id: insight.id,
    severity: insight.severity,
    occurredAt: insight.occurredAt,
    titleKey: 'winEventTitle',
    detailKey: 'winEventDetail',
    args: { winRuleName: insight.winRuleName, schemaName: insight.schemaName, clientId: insight.clientId },
  };
}

export function buildInsightsView(insights: ProjectInsight[]): InsightView[] {
  return insights.map(toInsightView);
}
