import { describe, expect, it } from 'vitest';
import { toCancellationTrend } from './churn-reason-view';
import { toQualityTierSlices } from './quality-score-view';
import { toFirmographicCompositionShares } from './firmographic-view';
import { buildDemoFlow, type DemoFlowLabels } from './sales-view';
import { toSupportTeamSummary, type SupportLeaderboardRowView } from './support-view';
import { toNpsTrendChartRows } from './feedback-view';
import { toRepCollectionInsights } from './rep-collection-view';
import { buildWinRuleFlow, countWinsByRule, toWinTrend, type WinRuleFlowLabels } from './win-rule-view';

/** Chart-data shaping behind the quality pages (churn, intent, firmographics, demos, feedback, support, rep collections, win rules). */

const now = new Date('2026-09-17T12:00:00Z');

function cancellation(landedAt: string, reasonCode: unknown = 'too_expensive') {
  return { landed_at: landedAt, payload: { properties: { reason_code: reasonCode } } };
}

describe('toCancellationTrend', () => {
  it('counts only records with a reason code, per week', () => {
    const trend = toCancellationTrend(
      [cancellation('2026-09-15T10:00:00Z'), cancellation('2026-09-16T10:00:00Z'), cancellation('2026-09-16T11:00:00Z', ''), { landed_at: '2026-09-09T00:00:00Z', payload: {} }],
      { now, weeks: 2, cap: 500 },
    );
    expect(trend.reliableFrom).toBeNull();
    expect(trend.buckets).toEqual([
      { start: '2026-09-07', total: 0, count: 0 },
      { start: '2026-09-14', total: 2, count: 2 },
    ]);
  });

  it('marks weeks before the oldest record unknown when the read came back full', () => {
    const trend = toCancellationTrend([cancellation('2026-09-16T10:00:00Z'), cancellation('2026-09-15T09:00:00Z')], { now, weeks: 2, cap: 2 });
    expect(trend.reliableFrom).toBe('2026-09-15T09:00:00.000Z');
    expect(trend.buckets[0]).toEqual({ start: '2026-09-07', total: null, count: null });
    expect(trend.buckets[1].count).toBe(2);
  });
});

describe('toQualityTierSlices', () => {
  it('orders tiers low to high with theme colours and drops empty tiers', () => {
    expect(toQualityTierSlices({ low: 2, medium: 0, high: 5 })).toEqual([
      { tier: 'low', count: 2, color: 'hsl(var(--destructive))' },
      { tier: 'high', count: 5, color: 'hsl(var(--success))' },
    ]);
  });
});

describe('toFirmographicCompositionShares', () => {
  it('puts share of profiles beside share of MRR, each against its own total', () => {
    expect(
      toFirmographicCompositionShares([
        { value: 'smb', count: 3, mrr: 100 },
        { value: 'enterprise', count: 1, mrr: 300 },
      ]),
    ).toEqual([
      { value: 'smb', count: 3, mrr: 100, countShare: 75, mrrShare: 25 },
      { value: 'enterprise', count: 1, mrr: 300, countShare: 25, mrrShare: 75 },
    ]);
  });

  it('reports a zero MRR share instead of dividing by zero', () => {
    expect(toFirmographicCompositionShares([{ value: 'x', count: 2, mrr: 0 }])[0]).toMatchObject({ countShare: 100, mrrShare: 0 });
  });
});

describe('buildDemoFlow', () => {
  const labels: DemoFlowLabels = {
    scheduled: 'Scheduled',
    held: 'Held',
    noShow: 'No-show',
    shareOfOutcomes: (percent) => `${percent}% of outcomes`,
    formatCount: (value) => String(value),
    percent: (percent) => `${percent}%`,
  };

  it('draws scheduled -> held / no-show with each outcome share on its edge', () => {
    const flow = buildDemoFlow({ demosScheduled: 10, demosHeld: 6, demosNoShow: 2 }, labels);
    expect(flow.nodes).toEqual([
      { id: 'scheduled', label: 'Scheduled', value: '10', status: 'ok' },
      { id: 'held', label: 'Held', value: '6', sublabel: '75% of outcomes', status: 'ok' },
      { id: 'no_show', label: 'No-show', value: '2', sublabel: '25% of outcomes', status: 'warn' },
    ]);
    expect(flow.edges.map((edge) => [edge.source, edge.target, edge.label])).toEqual([
      ['scheduled', 'held', '75%'],
      ['scheduled', 'no_show', '25%'],
    ]);
  });

  it('leaves shares off and every node idle before any demo has an outcome', () => {
    const flow = buildDemoFlow({ demosScheduled: 0, demosHeld: 0, demosNoShow: 0 }, labels);
    expect(flow.nodes.every((node) => node.status === 'idle' && node.sublabel === undefined)).toBe(true);
    expect(flow.edges.every((edge) => edge.label === undefined)).toBe(true);
  });
});

describe('toSupportTeamSummary', () => {
  const row = (overrides: Partial<SupportLeaderboardRowView>): SupportLeaderboardRowView => ({
    agentOrgPersonId: 'a',
    name: 'A',
    photoUrl: null,
    ticketsResolved: 1,
    avgFirstResponseSeconds: null,
    avgResolutionSeconds: null,
    avgCsatScore: null,
    ...overrides,
  });

  it('sums resolved tickets and picks the fastest responder and top CSAT agent', () => {
    const summary = toSupportTeamSummary([
      row({ agentOrgPersonId: 'a', name: 'Ada', ticketsResolved: 5, avgFirstResponseSeconds: 300, avgCsatScore: 4.2 }),
      row({ agentOrgPersonId: 'b', name: 'Bo', ticketsResolved: 3, avgFirstResponseSeconds: 120, avgCsatScore: null }),
      row({ agentOrgPersonId: 'c', name: 'Cy', ticketsResolved: 2, avgFirstResponseSeconds: null, avgCsatScore: 4.8 }),
    ]);
    expect(summary).toEqual({ ticketsResolved: 10, fastestFirstResponse: { name: 'Bo', seconds: 120 }, topCsat: { name: 'Cy', score: 4.8 } });
  });

  it('returns nulls rather than inventing a value when no agent reported one', () => {
    expect(toSupportTeamSummary([row({})])).toEqual({ ticketsResolved: 1, fastestFirstResponse: null, topCsat: null });
    expect(toSupportTeamSummary([])).toEqual({ ticketsResolved: 0, fastestFirstResponse: null, topCsat: null });
  });
});

describe('toNpsTrendChartRows', () => {
  const breakdown = (promoters: number, passives: number, detractors: number, npsScore: number | null) => ({
    totalResponses: promoters + passives + detractors,
    promoters,
    passives,
    detractors,
    npsScore,
  });

  it('keeps read days (zero volume included) and blanks days the capped read never reached', () => {
    const rows = toNpsTrendChartRows(
      [
        { date: '2026-09-14', breakdown: breakdown(1, 0, 0, 100) },
        { date: '2026-09-15', breakdown: breakdown(0, 0, 0, null) },
        { date: '2026-09-16', breakdown: breakdown(2, 1, 1, 25) },
      ],
      '2026-09-15',
      (date) => date.slice(5),
    );
    expect(rows).toEqual([
      { day: '09-14', promoters: null, passives: null, detractors: null, nps: null },
      { day: '09-15', promoters: 0, passives: 0, detractors: 0, nps: null },
      { day: '09-16', promoters: 2, passives: 1, detractors: 1, nps: 25 },
    ]);
  });
});

describe('toRepCollectionInsights', () => {
  it('sums amounts per month and per collection type, largest type first', () => {
    const insights = toRepCollectionInsights(
      [
        { amount: 100, occurredAt: '2026-09-02', collectionType: 'upgrade' },
        { amount: 50, occurredAt: '2026-08-20', collectionType: 'save' },
        { amount: 25, occurredAt: '2026-09-10', collectionType: 'save' },
        { amount: 999, occurredAt: '2025-01-01', collectionType: 'expansion' },
      ],
      { now, months: 2 },
    );
    expect(insights.monthly).toEqual([
      { start: '2026-08-01', total: 50, count: 1 },
      { start: '2026-09-01', total: 125, count: 2 },
    ]);
    expect(insights.byType).toEqual([
      { collectionType: 'expansion', total: 999, count: 1 },
      { collectionType: 'upgrade', total: 100, count: 1 },
      { collectionType: 'save', total: 75, count: 2 },
    ]);
    expect(insights.total).toBe(1174);
  });
});

describe('win rule charts', () => {
  const events = [
    { winRuleId: 'r1', createdAt: '2026-09-17T08:00:00Z' },
    { winRuleId: 'r1', createdAt: '2026-09-16T08:00:00Z' },
    { winRuleId: 'r2', createdAt: '2026-09-16T09:00:00Z' },
  ];

  it('counts recent wins per rule id', () => {
    expect(Object.fromEntries(countWinsByRule(events))).toEqual({ r1: 2, r2: 1 });
  });

  it('buckets wins per day and blanks days before the oldest row of a truncated read', () => {
    expect(toWinTrend(events, { now, days: 3, truncated: false }).buckets.map((bucket) => bucket.count)).toEqual([0, 2, 1]);
    const truncated = toWinTrend(events, { now, days: 3, truncated: true });
    expect(truncated.reliableFrom).toBe('2026-09-16T08:00:00.000Z');
    expect(truncated.buckets.map((bucket) => bucket.count)).toEqual([null, 2, 1]);
  });

  it('draws schema -> rule -> feed, with no feed edge for a disabled rule', () => {
    const labels: WinRuleFlowLabels = {
      action: 'Win feed',
      actionSublabel: 'Live',
      schemaSublabel: 'Trigger',
      inactive: 'Disabled',
      formatWins: (count) => `${count} wins`,
      schemaHref: (schema) => `/record-feed?schema=${schema}`,
    };
    const flow = buildWinRuleFlow(
      [
        { id: 'r1', name: 'Big order', schemaName: 'order_completed', active: true },
        { id: 'r2', name: 'Whale', schemaName: 'order_completed', active: false },
        { id: 'r3', name: 'Trial', schemaName: 'trial_started', active: true },
      ],
      new Map([
        ['r1', 2],
        ['r2', 1],
      ]),
      labels,
    );
    expect(flow.nodes.map((node) => [node.id, node.value ?? null, node.status])).toEqual([
      ['schema:order_completed', null, 'idle'],
      ['schema:trial_started', null, 'idle'],
      ['rule:r1', '2 wins', 'ok'],
      ['rule:r2', '1 wins', 'idle'],
      ['rule:r3', '0 wins', 'warn'],
      ['action:feed', '3 wins', 'ok'],
    ]);
    expect(flow.nodes[0].href).toBe('/record-feed?schema=order_completed');
    expect(flow.nodes.find((node) => node.id === 'rule:r2')?.sublabel).toBe('Disabled');
    expect(flow.edges.map((edge) => `${edge.source}>${edge.target}`)).toEqual([
      'schema:order_completed>rule:r1',
      'rule:r1>action:feed',
      'schema:order_completed>rule:r2',
      'schema:trial_started>rule:r3',
      'rule:r3>action:feed',
    ]);
    expect(flow.edges.find((edge) => edge.source === 'rule:r1')?.animated).toBe(true);
  });
});
