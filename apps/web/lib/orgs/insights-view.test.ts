import { describe, expect, it } from 'vitest';
import type { TrackingAlertModel, WinEventModel } from '@growthos/firebase-orm-models';
import { buildInsightsView } from './insights-view';

function alert(overrides: Partial<TrackingAlertModel> & Pick<TrackingAlertModel, 'id'>): TrackingAlertModel {
  return {
    schema_name: 'order_completed',
    status: 'active',
    detected_at: '2026-07-08T10:00:00.000Z',
    last_seen_at: '2026-07-08T09:00:00.000Z',
    last_checked_at: '2026-07-08T10:00:00.000Z',
    resolved_at: undefined,
    ...overrides,
  } as TrackingAlertModel;
}

function winEvent(overrides: Partial<WinEventModel> & Pick<WinEventModel, 'id'>): WinEventModel {
  return {
    win_rule_name: 'Big order',
    win_type: 'generic',
    schema_name: 'order_completed',
    client_id: 'ord_1',
    payload: {},
    occurred_at: '2026-07-11T00:00:00.000Z',
    created_at: '2026-07-11T00:00:01.000Z',
    ...overrides,
  } as WinEventModel;
}

describe('buildInsightsView', () => {
  it('maps a tracking alert to a warning insight', () => {
    const view = buildInsightsView([alert({ id: 'a1', schema_name: 'signup', detected_at: '2026-07-08T10:00:00.000Z', last_seen_at: '2026-07-08T09:00:00.000Z' })], []);
    expect(view).toEqual([
      { kind: 'tracking_alert', id: 'a1', schemaName: 'signup', lastSeenAt: '2026-07-08T09:00:00.000Z', occurredAt: '2026-07-08T10:00:00.000Z', severity: 'warning' },
    ]);
  });

  it('maps a win event to an info insight', () => {
    const view = buildInsightsView([], [winEvent({ id: 'w1', win_rule_name: 'Big order', schema_name: 'order_completed', client_id: 'ord_1', occurred_at: '2026-07-11T00:00:00.000Z' })]);
    expect(view).toEqual([
      { kind: 'win_event', id: 'w1', winRuleName: 'Big order', schemaName: 'order_completed', clientId: 'ord_1', occurredAt: '2026-07-11T00:00:00.000Z', severity: 'info' },
    ]);
  });

  it('merges both kinds and sorts newest-first by occurredAt', () => {
    const view = buildInsightsView(
      [alert({ id: 'a1', detected_at: '2026-07-10T00:00:00.000Z' })],
      [
        winEvent({ id: 'w1', occurred_at: '2026-07-11T00:00:00.000Z' }),
        winEvent({ id: 'w2', occurred_at: '2026-07-09T00:00:00.000Z' }),
      ],
    );
    expect(view.map((item) => item.id)).toEqual(['w1', 'a1', 'w2']);
  });

  it('caps the merged, sorted list to the given limit', () => {
    const alerts = Array.from({ length: 3 }, (_, index) =>
      alert({ id: `a${index}`, detected_at: `2026-07-0${index + 1}T00:00:00.000Z` }),
    );
    const view = buildInsightsView(alerts, [], 2);
    expect(view.map((item) => item.id)).toEqual(['a2', 'a1']);
  });

  it('returns an empty list when there are no alerts or wins', () => {
    expect(buildInsightsView([], [])).toEqual([]);
  });
});
