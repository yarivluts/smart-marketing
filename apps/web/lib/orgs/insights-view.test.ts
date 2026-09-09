import { describe, expect, it } from 'vitest';
import type { ProjectInsight } from '@growthos/firebase-orm-models';
import { buildInsightsView, toInsightView } from './insights-view';

describe('toInsightView', () => {
  it('maps a metric_health insight to the metricHealth translation keys + args, joining the reasons', () => {
    const insight: ProjectInsight = {
      kind: 'metric_health',
      id: 'metric-health:def-1',
      title: 'Metric "cac" cannot be queried as defined',
      detail: 'Formula dimension "platform" is not declared on referenced metric(s): new_paying.',
      occurredAt: '2026-08-01T00:00:00.000Z',
      severity: 'warning',
      metricName: 'cac',
      version: 1,
      reasons: ['Formula dimension "platform" is not declared on referenced metric(s): new_paying.', 'Second reason.'],
    };

    expect(toInsightView(insight)).toEqual({
      id: 'metric-health:def-1',
      severity: 'warning',
      occurredAt: '2026-08-01T00:00:00.000Z',
      titleKey: 'metricHealthTitle',
      detailKey: 'metricHealthDetail',
      args: { metricName: 'cac', version: '1', reasons: 'Formula dimension "platform" is not declared on referenced metric(s): new_paying. Second reason.' },
    });
  });

  it('maps a tracking_alert insight to the trackingAlert translation keys + args', () => {
    const insight: ProjectInsight = {
      kind: 'tracking_alert',
      id: 'alert-1',
      title: 'Tracking may be broken: "checkout_completed" has gone silent',
      detail: 'No new "checkout_completed" records landed since 2026-07-11T00:00:00.000Z.',
      occurredAt: '2026-07-12T00:00:00.000Z',
      severity: 'warning',
      schemaName: 'checkout_completed',
      lastSeenAt: '2026-07-11T00:00:00.000Z',
    };

    expect(toInsightView(insight)).toEqual({
      id: 'alert-1',
      severity: 'warning',
      occurredAt: '2026-07-12T00:00:00.000Z',
      titleKey: 'trackingAlertTitle',
      detailKey: 'trackingAlertDetail',
      args: { schemaName: 'checkout_completed', lastSeenAt: '2026-07-11T00:00:00.000Z' },
    });
  });

  it('maps a win_event insight to the winEvent translation keys + args', () => {
    const insight: ProjectInsight = {
      kind: 'win_event',
      id: 'win-1',
      title: 'Win: Big order',
      detail: 'A "order_completed" record matched the "Big order" win rule.',
      occurredAt: '2026-07-13T00:00:00.000Z',
      severity: 'info',
      winRuleName: 'Big order',
      schemaName: 'order_completed',
      clientId: 'client-1',
    };

    expect(toInsightView(insight)).toEqual({
      id: 'win-1',
      severity: 'info',
      occurredAt: '2026-07-13T00:00:00.000Z',
      titleKey: 'winEventTitle',
      detailKey: 'winEventDetail',
      args: { winRuleName: 'Big order', schemaName: 'order_completed', clientId: 'client-1' },
    });
  });
});

describe('buildInsightsView', () => {
  it('maps every insight in order, preserving the newest-first order the service already returns', () => {
    const insights: ProjectInsight[] = [
      {
        kind: 'win_event',
        id: 'win-1',
        title: 'Win: Big order',
        detail: 'A "order_completed" record matched the "Big order" win rule.',
        occurredAt: '2026-07-13T00:00:00.000Z',
        severity: 'info',
        winRuleName: 'Big order',
        schemaName: 'order_completed',
        clientId: 'client-1',
      },
      {
        kind: 'tracking_alert',
        id: 'alert-1',
        title: 'Tracking may be broken: "checkout_completed" has gone silent',
        detail: 'No new "checkout_completed" records landed since 2026-07-11T00:00:00.000Z.',
        occurredAt: '2026-07-12T00:00:00.000Z',
        severity: 'warning',
        schemaName: 'checkout_completed',
        lastSeenAt: '2026-07-11T00:00:00.000Z',
      },
    ];

    const view = buildInsightsView(insights);
    expect(view.map((item) => item.id)).toEqual(['win-1', 'alert-1']);
  });

  it('maps an empty list to an empty view', () => {
    expect(buildInsightsView([])).toEqual([]);
  });
});
