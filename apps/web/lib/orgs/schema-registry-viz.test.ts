import { describe, expect, it } from 'vitest';
import { deriveSetupHealth, type SetupSchemaObservation } from '@growthos/shared';
import { buildRequirementLanes, countFamiliesByKind, dailyVolumeTotals, stackedVolumeChart, totalEvents } from './schema-registry-viz';

const volume = (schemaName: string, counts: number[], lastSeenAt: string | null = null) => ({
  schemaName,
  lastSeenAt,
  dailyCounts: counts.map((count, index) => ({ date: `2026-09-2${index}`, count })),
});

describe('countFamiliesByKind', () => {
  it('counts each kind and ignores anything else', () => {
    expect(
      countFamiliesByKind([
        { kind: 'event', name: 'a' },
        { kind: 'event', name: 'b' },
        { kind: 'entity', name: 'customer' },
        { kind: 'mystery', name: 'x' },
      ]),
    ).toEqual({ event: 2, entity: 1, measure: 0 });
  });
});

describe('event volume shaping', () => {
  const entries = [volume('signup', [1, 2, 3]), volume('page_view', [10, 0, 5]), volume('cta_click', [0, 1, 0]), volume('trial_started', [0, 0, 0])];

  it('totals one schema and the whole window per day', () => {
    expect(totalEvents(entries[0])).toBe(6);
    expect(dailyVolumeTotals(entries)).toEqual([
      { date: '2026-09-20', count: 11 },
      { date: '2026-09-21', count: 3 },
      { date: '2026-09-22', count: 8 },
    ]);
  });

  it('stacks the busiest schemas and folds the rest into "other", skipping silent ones', () => {
    const chart = stackedVolumeChart(entries, 2, 'Other', (date) => date.slice(5));
    expect(chart.series).toEqual([
      { key: 's0', label: 'page_view' },
      { key: 's1', label: 'signup' },
      { key: 'other', label: 'Other' },
    ]);
    expect(chart.rows[0]).toEqual({ date: '09-20', s0: 10, s1: 1, other: 0 });
    expect(chart.rows[1]).toEqual({ date: '09-21', s0: 0, s1: 2, other: 1 });
  });

  it('has no "other" series when every active schema fits', () => {
    const chart = stackedVolumeChart(entries, 5, 'Other');
    expect(chart.series.map((series) => series.key)).toEqual(['s0', 's1', 's2']);
    expect(chart.rows[0]).not.toHaveProperty('other');
  });
});

describe('buildRequirementLanes', () => {
  const observation = (overrides: Partial<SetupSchemaObservation> & Pick<SetupSchemaObservation, 'schemaName' | 'kind'>): SetupSchemaObservation => ({
    environmentId: 'env-prod',
    registered: true,
    lastAcceptedAt: null,
    openQuarantinedCount: 0,
    quarantineReasons: [],
    ...overrides,
  });
  const health = deriveSetupHealth(
    [{ id: 'env-prod', name: 'prod' }],
    [
      observation({ schemaName: 'signup', kind: 'event', lastAcceptedAt: '2026-09-25T10:00:00.000Z' }),
      observation({ schemaName: 'subscription_state_change', kind: 'event', registered: false, openQuarantinedCount: 2 }),
    ],
  ).environments[0];

  it('places every registered schema under the requirement it feeds, coloured by what arrived', () => {
    const { lanes, unmapped } = buildRequirementLanes(
      [
        { kind: 'event', name: 'signup' },
        { kind: 'event', name: 'page_view' },
        { kind: 'measure', name: 'ad_spend' },
        { kind: 'measure', name: 'nps_score' },
      ],
      health,
    );
    const lane = (id: string) => lanes.find((candidate) => candidate.requirementId === id)!;
    expect(lanes).toHaveLength(6);
    expect(lane('signups')).toEqual({ requirementId: 'signups', status: 'connected', schemas: [{ kind: 'event', name: 'signup', status: 'flowing', registered: true }] });
    expect(lane('product_usage').schemas).toEqual([{ kind: 'event', name: 'page_view', status: 'silent', registered: true }]);
    expect(lane('ad_spend').schemas[0]).toMatchObject({ name: 'ad_spend', status: 'silent' });
    expect(unmapped).toEqual([{ kind: 'measure', name: 'nps_score' }]);
  });

  it('includes a rejected schema that was never registered', () => {
    const { lanes } = buildRequirementLanes([], health);
    const billing = lanes.find((candidate) => candidate.requirementId === 'billing')!;
    expect(billing.status).toBe('error');
    expect(billing.schemas).toEqual([{ kind: 'event', name: 'subscription_state_change', status: 'rejected', registered: false }]);
  });

  it('leaves the status unknown when health could not be derived', () => {
    const { lanes } = buildRequirementLanes([{ kind: 'event', name: 'signup' }], null);
    expect(lanes.every((lane) => lane.status === null)).toBe(true);
    expect(lanes.find((candidate) => candidate.requirementId === 'signups')!.schemas[0].status).toBe('silent');
  });
});
