import { describe, expect, it } from 'vitest';
import { aggregateCreativeFatigueTelemetry } from './creative-fatigue.service';
import type { RawRecordModel } from '../models/raw-record.model';

function creativeRecord(overrides: {
  id: string;
  creativeId: string;
  creativeName?: string;
  channel?: string;
  impressions: number;
  clicks: number;
  reach?: number;
  spend?: number;
  frequency?: number;
  baselineCtr?: number;
  landedAt: string;
}): RawRecordModel {
  return {
    id: overrides.id,
    kind: 'event',
    schema_name: 'ad_creative_insight',
    landed_at: overrides.landedAt,
    payload: {
      event_id: `evt_${overrides.id}`,
      event: 'ad_creative_insight',
      ts: overrides.landedAt,
      properties: {
        creative_id: overrides.creativeId,
        creative_name: overrides.creativeName ?? `Creative ${overrides.creativeId}`,
        channel: overrides.channel ?? 'meta',
        impressions: overrides.impressions,
        clicks: overrides.clicks,
        reach: overrides.reach,
        spend: overrides.spend ?? 100,
        frequency: overrides.frequency,
        baseline_ctr: overrides.baselineCtr,
      },
    },
  } as unknown as RawRecordModel;
}

describe('aggregateCreativeFatigueTelemetry (KAN-305 pure aggregator)', () => {
  it('returns clean, honest empty state when records array is empty', () => {
    const result = aggregateCreativeFatigueTelemetry([]);
    expect(result).toEqual({
      hasData: false,
      totalCreatives: 0,
      freshCount: 0,
      wearingOutCount: 0,
      fatiguedCount: 0,
      avgDecayRatePct: 0,
      avgFrequency: 0,
      budgetAtRisk: 0,
      creatives: [],
    });
  });

  it('correctly scores decay rate, classifies fatigue levels, and assigns automated swap recommendations', () => {
    const records = [
      // 1. Fresh creative: Frequency 1.25x, CTR 3.0%, Baseline 3.0% -> Decay 0%
      creativeRecord({
        id: 'r1',
        creativeId: 'cr_fresh',
        creativeName: 'Spring Sale Video A',
        channel: 'meta',
        impressions: 10000,
        clicks: 300,
        reach: 8000,
        spend: 250,
        baselineCtr: 0.03,
        landedAt: '2026-10-01T10:00:00Z',
      }),
      // 2. Wearing out creative: Frequency 3.0x, CTR 2.0%, Baseline 2.5% -> Decay 20%
      creativeRecord({
        id: 'r2',
        creativeId: 'cr_wear',
        creativeName: 'Summer Promo Carousel',
        channel: 'google',
        impressions: 15000,
        clicks: 300,
        reach: 5000,
        spend: 400,
        baselineCtr: 0.025,
        landedAt: '2026-10-01T10:00:00Z',
      }),
      // 3. Fatigued creative: Frequency 5.0x, CTR 1.0%, Baseline 3.0% -> Decay 66.7%
      creativeRecord({
        id: 'r3',
        creativeId: 'cr_fatigued',
        creativeName: 'Legacy Hero Banner',
        channel: 'meta',
        impressions: 50000,
        clicks: 500,
        reach: 10000,
        spend: 1200,
        baselineCtr: 0.03,
        landedAt: '2026-10-01T10:00:00Z',
      }),
    ];

    const result = aggregateCreativeFatigueTelemetry(records);

    expect(result.hasData).toBe(true);
    expect(result.totalCreatives).toBe(3);
    expect(result.freshCount).toBe(1);
    expect(result.wearingOutCount).toBe(1);
    expect(result.fatiguedCount).toBe(1);

    // Fatigued should be sorted first (highest decay)
    expect(result.creatives[0].creativeId).toBe('cr_fatigued');
    expect(result.creatives[0].fatigueLevel).toBe('fatigued');
    expect(result.creatives[0].recommendedAction).toBe('auto_swap');
    expect(result.creatives[0].frequency).toBe(5);
    expect(result.creatives[0].currentCtrPct).toBe(1);
    expect(result.creatives[0].baselineCtrPct).toBe(3);
    expect(result.creatives[0].decayPct).toBe(66.7);

    // Wearing out second
    expect(result.creatives[1].creativeId).toBe('cr_wear');
    expect(result.creatives[1].fatigueLevel).toBe('wearing_out');
    expect(result.creatives[1].recommendedAction).toBe('review');
    expect(result.creatives[1].frequency).toBe(3);
    expect(result.creatives[1].decayPct).toBe(20);

    // Fresh third
    expect(result.creatives[2].creativeId).toBe('cr_fresh');
    expect(result.creatives[2].fatigueLevel).toBe('fresh');
    expect(result.creatives[2].recommendedAction).toBe('scale');
    expect(result.creatives[2].frequency).toBe(1.25);
    expect(result.creatives[2].decayPct).toBe(0);

    // Budget at risk: 100% of fatigued ($1200) + 50% of wearing out ($200) = $1400
    expect(result.budgetAtRisk).toBe(1400);
  });

  it('deduplicates multiple landed snapshots by creative_id, keeping the newest landed snapshot', () => {
    const records = [
      // Older snapshot: was fresh
      creativeRecord({
        id: 'r_old',
        creativeId: 'cr_dynamic',
        impressions: 5000,
        clicks: 150,
        reach: 4500,
        spend: 100,
        baselineCtr: 0.03,
        landedAt: '2026-09-15T00:00:00Z',
      }),
      // Newer snapshot: fatigued
      creativeRecord({
        id: 'r_new',
        creativeId: 'cr_dynamic',
        impressions: 40000,
        clicks: 400,
        reach: 8000,
        spend: 900,
        baselineCtr: 0.03,
        landedAt: '2026-09-30T00:00:00Z',
      }),
    ];

    const result = aggregateCreativeFatigueTelemetry(records);
    expect(result.totalCreatives).toBe(1);
    expect(result.creatives[0].id).toBe('r_new');
    expect(result.creatives[0].fatigueLevel).toBe('fatigued');
    expect(result.creatives[0].frequency).toBe(5);
  });
});
