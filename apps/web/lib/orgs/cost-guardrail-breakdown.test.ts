import { describe, expect, it } from 'vitest';
import { breakdownCostLog, quotaUsagePct, type QueryCostLogEntryView } from './cost-guardrail-view';

function entry(overrides: Partial<QueryCostLogEntryView> & Pick<QueryCostLogEntryView, 'id' | 'executedAt'>): QueryCostLogEntryView {
  return { outcome: 'executed', definitionRefs: {}, estimatedCostUsd: null, ...overrides };
}

describe('breakdownCostLog', () => {
  const entries = [
    entry({ id: '1', executedAt: '2026-09-26T20:24:54Z', definitionRefs: { a: 'metric:lp_visitors@v1', b: 'metric:signups@v1' }, estimatedCostUsd: 0.001 }),
    entry({ id: '2', executedAt: '2026-09-26T10:00:00Z', definitionRefs: { a: 'metric:lp_visitors@v1' }, outcome: 'warehouse_not_configured' }),
    entry({ id: '3', executedAt: '2026-09-25T09:00:00Z', outcome: 'blocked_quota_exceeded' }),
  ];

  it('counts outcomes', () => {
    expect(breakdownCostLog(entries).byOutcome).toEqual({ executed: 1, warehouse_not_configured: 1, blocked_quota_exceeded: 1 });
  });

  it('buckets outcomes and estimated cost per UTC day, oldest first', () => {
    expect(breakdownCostLog(entries).byDay).toEqual([
      { day: '2026-09-25', executed: 0, blocked_quota_exceeded: 1, warehouse_not_configured: 0, estimatedCostUsd: 0 },
      { day: '2026-09-26', executed: 1, blocked_quota_exceeded: 0, warehouse_not_configured: 1, estimatedCostUsd: 0.001 },
    ]);
  });

  it('ranks the metric definitions the queries referenced', () => {
    expect(breakdownCostLog(entries).topDefinitions).toEqual([
      { definition: 'metric:lp_visitors@v1', count: 2 },
      { definition: 'metric:signups@v1', count: 1 },
    ]);
  });

  it('is empty for no entries', () => {
    expect(breakdownCostLog([])).toEqual({ byOutcome: { executed: 0, warehouse_not_configured: 0, blocked_quota_exceeded: 0 }, byDay: [], topDefinitions: [] });
  });
});

describe('quotaUsagePct', () => {
  it('is attempts over the limit, capped at 100, and 0 for a zero limit', () => {
    expect(quotaUsagePct({ attemptedToday: 70, limit: 200 })).toBe(35);
    expect(quotaUsagePct({ attemptedToday: 250, limit: 200 })).toBe(100);
    expect(quotaUsagePct({ attemptedToday: 3, limit: 0 })).toBe(0);
  });
});
