import { describe, expect, it } from 'vitest';
import type { WinEventModel, WinRuleModel } from '@growthos/firebase-orm-models';
import { toWinEventFeedItem, toWinRuleSummaryView } from './win-rule-view';

function winRule(overrides: Partial<WinRuleModel> & Pick<WinRuleModel, 'id'>): WinRuleModel {
  return {
    name: 'Big order',
    schema_name: 'order_completed',
    filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
    win_type: 'generic',
    active: true,
    created_at: '2026-07-11T00:00:00.000Z',
    ...overrides,
  } as WinRuleModel;
}

function winEvent(overrides: Partial<WinEventModel> & Pick<WinEventModel, 'id'>): WinEventModel {
  return {
    win_rule_name: 'Big order',
    win_type: 'generic',
    schema_name: 'order_completed',
    client_id: 'ord_1',
    payload: { properties: { amount: 150 } },
    occurred_at: '2026-07-11T00:00:00.000Z',
    created_at: '2026-07-11T00:00:01.000Z',
    ...overrides,
  } as WinEventModel;
}

describe('toWinRuleSummaryView', () => {
  it('maps a win rule to its list-card summary', () => {
    const view = toWinRuleSummaryView(winRule({ id: 'r1' }));
    expect(view).toEqual({
      id: 'r1',
      name: 'Big order',
      schemaName: 'order_completed',
      filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
      winType: 'generic',
      active: true,
      createdAt: '2026-07-11T00:00:00.000Z',
    });
  });

  it('maps a KAN-66 win-catalog type through', () => {
    const view = toWinRuleSummaryView(winRule({ id: 'r2', win_type: 'reactivation' }));
    expect(view.winType).toBe('reactivation');
  });
});

describe('toWinEventFeedItem', () => {
  it('maps a fired win to its feed item', () => {
    const item = toWinEventFeedItem(winEvent({ id: 'w1' }));
    expect(item).toEqual({
      id: 'w1',
      winRuleName: 'Big order',
      winType: 'generic',
      schemaName: 'order_completed',
      clientId: 'ord_1',
      payload: { properties: { amount: 150 } },
      occurredAt: '2026-07-11T00:00:00.000Z',
      createdAt: '2026-07-11T00:00:01.000Z',
    });
  });

  it('maps a KAN-66 win-catalog type through', () => {
    const item = toWinEventFeedItem(winEvent({ id: 'w2', win_type: 'trial_conversion' }));
    expect(item.winType).toBe('trial_conversion');
  });
});
