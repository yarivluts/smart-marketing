import { describe, expect, it } from 'vitest';
import type { ProjectInsight } from '@growthos/firebase-orm-models';
import en from '../../messages/en.json';
import he from '../../messages/he.json';
import { buildInsightsView, toInsightView, type InsightView } from './insights-view';

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

describe('the Insights page copy accounts for every insight kind it can render', () => {
  /**
   * The page rendered three kinds and described two. `description` promised
   * "tracking that may be broken and wins your win rules just caught", and
   * `empty` said the page "fills in once a tracking alert fires or a win rule
   * matches" — both written before `metric_health` was added by the EasySign
   * P-03 audit, neither updated when it was (KAN-158).
   *
   * That omission is not cosmetic on this page in particular. An admin looking
   * at an empty Insights page was told, in so many words, the two things that
   * would populate it — so a project whose metrics are quietly unqueryable
   * reads as a project with nothing to report, and the one surface that would
   * have said otherwise is the one doing the misleading.
   *
   * Keyed off the `titleKey` union rather than a hand-written list, so adding a
   * fourth kind fails here until the page copy mentions it. That is the actual
   * invariant: the copy enumerates what the page can show, and an enumeration
   * that silently falls behind its subject is worse than no enumeration.
   *
   * English only — the Hebrew strings say the same thing with different words,
   * and asserting a translation's vocabulary would make every rewording a test
   * failure without catching a missing kind any earlier.
   */
  const KIND_MUST_APPEAR_IN_COPY: Record<InsightView['titleKey'], RegExp> = {
    trackingAlertTitle: /tracking/i,
    winEventTitle: /win/i,
    metricHealthTitle: /metric/i,
  };

  it.each(Object.entries(KIND_MUST_APPEAR_IN_COPY))('%s is accounted for in both description and empty', (titleKey, pattern) => {
    for (const key of ['description', 'empty'] as const) {
      const text = en.Insights[key];
      expect({ titleKey, key, mentioned: pattern.test(text) ? true : text }).toEqual({ titleKey, key, mentioned: true });
    }
  });

  /**
   * Every key the view can emit has to exist, in both locales: `t()` on a
   * missing key throws, so a kind whose copy was never written takes the whole
   * page down rather than degrading. `truncated` is in the list because the
   * page now renders it whenever the feed is capped — a path that only appears
   * on projects with more than a screen of insights, which is exactly where a
   * missing key would be found by a user rather than by this suite.
   */
  it('has every message key the page reads, in en and he', () => {
    const required = [
      ...Object.keys(KIND_MUST_APPEAR_IN_COPY),
      ...Object.keys(KIND_MUST_APPEAR_IN_COPY).map((key) => key.replace('Title', 'Detail')),
      'description',
      'empty',
      'truncated',
    ].sort();

    for (const [locale, messages] of [
      ['en', en],
      ['he', he],
    ] as const) {
      const missing = required.filter((key) => typeof (messages.Insights as Record<string, unknown>)[key] !== 'string');
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });
});
