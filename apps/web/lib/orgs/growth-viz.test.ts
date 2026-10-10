import { describe, expect, it } from 'vitest';
import {
  averageRetentionCurve,
  buildFunnelConversionRows,
  buildFunnelFlow,
  buildFunnelLosses,
  customerDisplayName,
  customerSchemaBreakdown,
  entityInitials,
  funnelDropOffStatus,
  funnelStepLabel,
  goalComparisonRows,
  goalTrendRows,
  goalTrendTile,
  goalTrendWindow,
  groupInsightsByDay,
  insightKind,
  insightsPerDay,
  summarizeEntitySchemas,
  summarizeGoalStatusMix,
  summarizeInsights,
  summarizeSegments,
  vizFormatForMetricUnit,
} from './growth-viz';
import type { CohortHeatmapRow, FunnelStepItem } from './funnel-goals-synthesizer';
import type { InsightView } from './insights-view';

const STEPS: FunnelStepItem[] = [
  { eventSchemaName: 'signup', stageKey: 'signup', stageLabel: 'signup', stepOrder: 2, customerCount: 2, conversionPercent: 40, dropOffPercent: 60 },
  { eventSchemaName: 'touchpoint', stageKey: 'awareness', stageLabel: 'awareness', stepOrder: 1, customerCount: 5, conversionPercent: 100, dropOffPercent: 0 },
  { eventSchemaName: 'document_sent', stageKey: 'activation', stageLabel: 'activation', stepOrder: 3, customerCount: 2, conversionPercent: 40, dropOffPercent: 0 },
  { eventSchemaName: 'document_signed', stageKey: 'activation', stageLabel: 'activation', stepOrder: 4, customerCount: 1, conversionPercent: 20, dropOffPercent: 25 },
];

const text = {
  people: (count: number) => `${count} people`,
  conversion: (percent: number) => `${percent}% of step 1`,
  dropOff: (percent: number) => `${percent}% lost`,
};

describe('funnel shaping', () => {
  it('grades drop-off severity at a fifth and at half', () => {
    expect(funnelDropOffStatus(0)).toBe('ok');
    expect(funnelDropOffStatus(19)).toBe('ok');
    expect(funnelDropOffStatus(20)).toBe('warn');
    expect(funnelDropOffStatus(49)).toBe('warn');
    expect(funnelDropOffStatus(50)).toBe('error');
  });

  it('builds one node per step in step order, and one edge per transition labelled with its loss', () => {
    const { nodes, edges } = buildFunnelFlow(STEPS, text);
    expect(nodes.map((node) => node.id)).toEqual(['step-1', 'step-2', 'step-3', 'step-4']);
    expect(nodes[0]).toMatchObject({ label: 'touchpoint', value: '5 people', status: 'ok', sublabel: 'awareness · 100% of step 1' });
    // A step whose event and stage share a name says it once.
    expect(nodes[1]).toMatchObject({ label: 'signup', sublabel: '40% of step 1' });
    expect(nodes[1].status).toBe('error');
    expect(nodes[2].status).toBe('ok');
    expect(nodes[3].status).toBe('warn');
    expect(edges).toEqual([
      { source: 'step-1', target: 'step-2', label: '60% lost', status: 'error' },
      { source: 'step-2', target: 'step-3', label: '0% lost', status: 'ok' },
      { source: 'step-3', target: 'step-4', label: '25% lost', status: 'warn' },
    ]);
  });

  it('marks an empty first step idle rather than healthy', () => {
    const { nodes } = buildFunnelFlow([{ ...STEPS[1], customerCount: 0 }], text);
    expect(nodes[0].status).toBe('idle');
  });

  it('labels steps by position and event, so repeated stage keys stay distinct', () => {
    const rows = buildFunnelConversionRows(STEPS);
    expect(rows.map((row) => row.step)).toEqual(['1. touchpoint', '2. signup', '3. document_sent', '4. document_signed']);
    expect(rows.map((row) => row.conversion)).toEqual([100, 40, 40, 20]);
    expect(funnelStepLabel({ stepOrder: 7, stageLabel: 'other' })).toBe('7. other');
  });

  it('lists only transitions that lost people, biggest loss first', () => {
    const losses = buildFunnelLosses(STEPS);
    expect(losses.map((loss) => [loss.from.stepOrder, loss.to.stepOrder, loss.lost])).toEqual([
      [1, 2, 3],
      [3, 4, 1],
    ]);
  });
});

describe('goal shaping', () => {
  it('counts every goal once: paused, measured pace, or unmeasured', () => {
    expect(
      summarizeGoalStatusMix([
        { isPaused: true, progressKind: 'ok', status: 'on_track' },
        { isPaused: false, progressKind: 'ok', status: 'on_track' },
        { isPaused: false, progressKind: 'ok', status: 'off_track' },
        { isPaused: false, progressKind: 'no_measurements', status: null },
        { isPaused: false, progressKind: 'query_error', status: null },
      ]),
    ).toEqual({ on_track: 1, at_risk: 0, off_track: 1, paused: 1, unmeasured: 2 });
  });

  it('maps a metric unit to a chart value format', () => {
    expect(vizFormatForMetricUnit(undefined)).toBe('number');
    expect(vizFormatForMetricUnit({ kind: 'ratio' })).toBe('ratio');
    expect(vizFormatForMetricUnit({ kind: 'percent' })).toBe('percent');
    expect(vizFormatForMetricUnit({ kind: 'currency', currency: 'ILS' })).toEqual({ currency: 'ILS' });
    expect(vizFormatForMetricUnit({ kind: 'currency' })).toBe('number');
    expect(vizFormatForMetricUnit({ kind: 'count' })).toBe('number');
  });

  it('draws a trend only from the goal start, and stops at the deadline', () => {
    const goal = { start_date: '2026-08-17', deadline: '2026-09-30' };
    expect(goalTrendWindow(goal, '2026-08-01')).toBeNull();
    expect(goalTrendWindow(goal, '2026-09-10')).toEqual({ start: '2026-08-17', end: '2026-09-10' });
    expect(goalTrendWindow(goal, '2026-10-05')).toEqual({ start: '2026-08-17', end: '2026-09-30' });
    expect(goalTrendTile('lp_conversion_rate')).toMatchObject({ type: 'line', metricNames: ['lp_conversion_rate'], dimensions: [] });
  });

  it('keeps a day without a value as a gap', () => {
    const rows = goalTrendRows(
      [
        { bucket: '2026-09-02T00:00:00Z', value: null },
        { bucket: '2026-09-01', value: 3 },
      ],
      (day) => `d:${day}`,
    );
    expect(rows).toEqual([
      { day: 'd:2026-09-01', value: 3 },
      { day: 'd:2026-09-02', value: null },
    ]);
  });

  it('compares actual, expected, projected and the target - both ends for a range goal', () => {
    const labels = { actual: 'A', expected: 'E', projected: 'P', target: 'T', rangeMin: 'Min', rangeMax: 'Max' };
    const measured = { actualValue: 0.4, expectedAtNow: 0.08, projectedFinalValue: 3 };
    expect(goalComparisonRows(measured, { direction: 'maximize', target_value: 0.08, range_min: null, range_max: null }, labels)).toEqual([
      { label: 'A', value: 0.4 },
      { label: 'E', value: 0.08 },
      { label: 'P', value: 3 },
      { label: 'T', value: 0.08 },
    ]);
    expect(goalComparisonRows(measured, { direction: 'range', target_value: null, range_min: 1, range_max: 2 }, labels).map((row) => row.label)).toEqual(['A', 'E', 'P', 'Min', 'Max']);
  });
});

describe('averageRetentionCurve', () => {
  it('averages the cohorts that reached each period and leaves unreached periods null', () => {
    const row = (month: string, cells: [number, number][]): CohortHeatmapRow => ({
      cohortMonth: month,
      cohortLabel: month,
      cohortSize: 10,
      retentionByPeriod: new Map(cells.map(([period, rate]) => [period, { retainedCount: rate / 10, retentionRatePercent: rate, colorClass: '' }])),
    });
    const curve = averageRetentionCurve(
      [
        row('2026-01-01', [
          [0, 100],
          [1, 40],
        ]),
        row('2026-02-01', [
          [0, 100],
          [1, 25],
        ]),
      ],
      [0, 1, 2],
    );
    expect(curve).toEqual([
      { periodNumber: 0, retention: 100 },
      { periodNumber: 1, retention: 32.5 },
      { periodNumber: 2, retention: null },
    ]);
  });
});

describe('insight shaping', () => {
  const insight = (id: string, titleKey: InsightView['titleKey'], severity: InsightView['severity'], occurredAt: string): InsightView => ({
    id,
    titleKey,
    detailKey: 'winEventDetail',
    severity,
    occurredAt,
    args: {},
  });
  const feed = [
    insight('a', 'trackingAlertTitle', 'warning', '2026-09-15T08:00:00.000Z'),
    insight('b', 'winEventTitle', 'info', '2026-09-15T19:59:52.192Z'),
    insight('c', 'metricHealthTitle', 'warning', '2026-09-14T10:00:00.000Z'),
    insight('d', 'winEventTitle', 'info', '2026-09-16T01:00:00.000Z'),
  ];

  it('classifies each insight by its kind', () => {
    expect(feed.map(insightKind)).toEqual(['tracking_alert', 'win_event', 'metric_health', 'win_event']);
  });

  it('counts severities and kinds, and finds the latest', () => {
    expect(summarizeInsights(feed)).toEqual({
      total: 4,
      warnings: 2,
      info: 2,
      byKind: { tracking_alert: 1, win_event: 2, metric_health: 1 },
      latestAt: '2026-09-16T01:00:00.000Z',
    });
    expect(summarizeInsights([]).latestAt).toBeNull();
  });

  it('buckets insights per day, oldest first', () => {
    expect(insightsPerDay(feed)).toEqual([
      { day: '2026-09-14', warning: 1, info: 0 },
      { day: '2026-09-15', warning: 1, info: 1 },
      { day: '2026-09-16', warning: 0, info: 1 },
    ]);
  });

  it('groups the timeline by day, newest day first, keeping order within a day', () => {
    expect(groupInsightsByDay(feed).map((group) => [group.day, group.items.map((item) => item.id)])).toEqual([
      ['2026-09-16', ['d']],
      ['2026-09-15', ['a', 'b']],
      ['2026-09-14', ['c']],
    ]);
  });
});

describe('customer shaping', () => {
  it('breaks matches down by schema, most matches first', () => {
    expect(customerSchemaBreakdown([{ schemaName: 'lead' }, { schemaName: 'customer' }, { schemaName: 'customer' }])).toEqual([
      { schemaName: 'customer', count: 2 },
      { schemaName: 'lead', count: 1 },
    ]);
  });

  it('leads a result card with the first non-PII value, else the id', () => {
    expect(
      customerDisplayName({
        entityId: 'e-1',
        fields: [
          { name: 'email', value: '••••••', isPii: true },
          { name: 'plan', value: '', isPii: false },
          { name: 'company', value: 'Acme Ltd', isPii: false },
        ],
      }),
    ).toBe('Acme Ltd');
    expect(customerDisplayName({ entityId: 'e-2', fields: [{ name: 'email', value: '••••••', isPii: true }] })).toBe('e-2');
  });

  it('derives initials from a name or an id', () => {
    expect(entityInitials('Acme Ltd')).toBe('AL');
    expect(entityInitials('f4af055c-7ee8')).toBe('F7');
    expect(entityInitials('acme')).toBe('AC');
    expect(entityInitials('---')).toBe('#');
  });

  it('summarises what each entity schema declares', () => {
    expect(
      summarizeEntitySchemas([
        {
          schemaName: 'customer',
          fieldDefs: [
            { name: 'id', type: 'string', is_pii: false, is_identity_key: true },
            { name: 'email', type: 'string', is_pii: true, is_identity_key: false },
          ],
        },
      ]),
    ).toEqual([
      {
        schemaName: 'customer',
        fieldCount: 2,
        piiCount: 1,
        identityKeys: ['id'],
        fields: [
          { name: 'id', type: 'string', isPii: false, isIdentityKey: true },
          { name: 'email', type: 'string', isPii: true, isIdentityKey: false },
        ],
      },
    ]);
  });
});

describe('summarizeSegments', () => {
  it('sums only measured member counts and finds the largest', () => {
    const stats = summarizeSegments(
      [
        { id: 's1', name: 'Lawyers', status: 'open' },
        { id: 's2', name: 'Paying', status: 'in_progress' },
        { id: 's3', name: 'Churned', status: 'done' },
      ],
      new Map([
        ['s1', { kind: 'ok', count: 0 }],
        ['s2', { kind: 'ok', count: 12 }],
        ['s3', { kind: 'warehouse_not_configured' }],
      ] as const),
    );
    expect(stats).toEqual({
      totalMembers: 12,
      measuredCount: 2,
      largest: { id: 's2', name: 'Paying', count: 12 },
      byStatus: { open: 1, in_progress: 1, done: 1 },
    });
  });

  it('reports no total when nothing was measured', () => {
    expect(summarizeSegments([{ id: 's1', name: 'A', status: 'open' }], new Map([['s1', { kind: 'query_error' }]] as const)).totalMembers).toBeNull();
  });

  it('names no largest segment when every measured segment is empty - an empty segment is not "the largest"', () => {
    const stats = summarizeSegments(
      [
        { id: 's1', name: 'Lawyers', status: 'open' },
        { id: 's2', name: 'Paying', status: 'open' },
      ],
      new Map([
        ['s1', { kind: 'ok', count: 0 }],
        ['s2', { kind: 'ok', count: 0 }],
      ] as const),
    );
    expect(stats.largest).toBeNull();
    // The counts were measured: the total is a real 0, not "no data".
    expect(stats.totalMembers).toBe(0);
    expect(stats.measuredCount).toBe(2);
  });

  it('names the only non-empty segment as the largest even when it comes after empty ones', () => {
    const stats = summarizeSegments(
      [
        { id: 's1', name: 'Empty', status: 'open' },
        { id: 's2', name: 'One member', status: 'open' },
      ],
      new Map([
        ['s1', { kind: 'ok', count: 0 }],
        ['s2', { kind: 'ok', count: 1 }],
      ] as const),
    );
    expect(stats.largest).toEqual({ id: 's2', name: 'One member', count: 1 });
  });
});
