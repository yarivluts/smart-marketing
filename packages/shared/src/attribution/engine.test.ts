import { describe, expect, it } from 'vitest';
import {
  buildMarkovTransitionMatrix,
  calculateFirstTouchAttribution,
  calculateLastTouchAttribution,
  calculateLinearAttribution,
  calculateMarkovAttribution,
  calculateShapleyAttribution,
  calculateTimeDecayAttribution,
  calculateWShapedAttribution,
  computeMultiTouchAttributionMatrix,
  getBaselineAttributionTelemetry,
} from './engine';
import { CustomerJourneyRecord } from './types';

describe('attribution engine (@growthos/shared)', () => {
  const sampleJourneys: CustomerJourneyRecord[] = [
    {
      journeyId: 'j-1',
      customerId: 'user-1',
      converted: true,
      conversionRevenue: 100,
      conversionTimestamp: 10000,
      touchpoints: [
        { channelId: 'meta_ads', channelName: 'Meta Ads', timestamp: 1000 },
        { channelId: 'google_search', channelName: 'Google Search', timestamp: 5000 },
      ],
    },
    {
      journeyId: 'j-2',
      customerId: 'user-2',
      converted: true,
      conversionRevenue: 200,
      conversionTimestamp: 20000,
      touchpoints: [
        { channelId: 'tiktok_ugc', channelName: 'TikTok UGC', timestamp: 2000 },
        { channelId: 'meta_ads', channelName: 'Meta Ads', timestamp: 8000 },
        { channelId: 'google_search', channelName: 'Google Search', timestamp: 15000 },
      ],
    },
    {
      journeyId: 'j-3',
      customerId: 'user-3',
      converted: false,
      conversionRevenue: 0,
      conversionTimestamp: 0,
      touchpoints: [
        { channelId: 'tiktok_ugc', channelName: 'TikTok UGC', timestamp: 3000 },
      ],
    },
  ];

  it('calculates first-touch attribution with 100% early credit', () => {
    const ft = calculateFirstTouchAttribution(sampleJourneys);
    // j-1: first touch meta_ads ($100)
    // j-2: first touch tiktok_ugc ($200)
    expect(ft['meta_ads']).toBe(100);
    expect(ft['tiktok_ugc']).toBe(200);
    expect(ft['google_search']).toBeUndefined();
  });

  it('calculates last-touch attribution with 100% late credit', () => {
    const lt = calculateLastTouchAttribution(sampleJourneys);
    // j-1: last touch google_search ($100)
    // j-2: last touch google_search ($200)
    expect(lt['google_search']).toBe(300);
    expect(lt['meta_ads']).toBeUndefined();
    expect(lt['tiktok_ugc']).toBeUndefined();
  });

  it('calculates linear multi-touch attribution (equal division 1/N)', () => {
    const lin = calculateLinearAttribution(sampleJourneys);
    // j-1: 50 to meta, 50 to google
    // j-2: 66.67 to tiktok, 66.67 to meta, 66.67 to google
    expect(lin['meta_ads']).toBeCloseTo(116.67, 1);
    expect(lin['google_search']).toBeCloseTo(116.67, 1);
    expect(lin['tiktok_ugc']).toBeCloseTo(66.67, 1);

    const total = Object.values(lin).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(300, 2);
  });

  it('calculates time-decay attribution weighting recent touches higher', () => {
    const td = calculateTimeDecayAttribution(sampleJourneys, 14);
    expect(td['google_search']).toBeGreaterThan(td['meta_ads']);
    const total = Object.values(td).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(300, 2);
  });

  it('calculates W-shaped attribution with 40-20-40 allocation', () => {
    const ws = calculateWShapedAttribution(sampleJourneys, 0.4, 0.2, 0.4);
    // j-1 (2 touches): 50% first (meta), 50% last (google) => 50 each
    // j-2 (3 touches): 40% tiktok (80), 20% meta (40), 40% google (80)
    expect(ws['tiktok_ugc']).toBe(80);
    expect(ws['meta_ads']).toBe(90); // 50 + 40
    expect(ws['google_search']).toBe(130); // 50 + 80
  });

  it('builds Markov transition matrix and calculates removal effects', () => {
    const matrix = buildMarkovTransitionMatrix(sampleJourneys);
    expect(matrix.states).toContain('(start)');
    expect(matrix.states).toContain('(conversion)');
    expect(matrix.states).toContain('(null)');

    const weights = matrix.normalizedWeights;
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(totalWeight).toBeCloseTo(1.0, 4);

    const markovRev = calculateMarkovAttribution(sampleJourneys);
    const totalRev = Object.values(markovRev).reduce((a, b) => a + b, 0);
    expect(totalRev).toBeCloseTo(300, 2);
  });

  it('calculates Shapley value cooperative game-theoretic attribution', () => {
    const shapley = calculateShapleyAttribution(sampleJourneys);
    expect(shapley['google_search']).toBeGreaterThan(0);
    expect(shapley['meta_ads']).toBeGreaterThan(0);
    expect(shapley['tiktok_ugc']).toBeGreaterThan(0);

    const total = Object.values(shapley).reduce((a, b) => a + b, 0);
    // Total distributed across game coalitions must equal total conversion revenue
    expect(total).toBeCloseTo(300, 1);
  });

  it('computes complete multi-touch attribution matrix telemetry', () => {
    const telemetry = computeMultiTouchAttributionMatrix(sampleJourneys);
    expect(telemetry.kpis.totalAttributedRevenue).toBe(300);
    expect(telemetry.kpis.verifiedConversions).toBe(2);
    expect(telemetry.channels.length).toBeGreaterThanOrEqual(3);
    expect(telemetry.pathways.length).toBeGreaterThanOrEqual(1);
    expect(telemetry.copilot).toBeDefined();
    expect(telemetry.ingestionHealth.status).toBe('healthy');
  });

  it('provides baseline telemetry matching Stitch 2bc944e2 exact KPIs', () => {
    const baseline = getBaselineAttributionTelemetry(60);
    expect(baseline.kpis.totalAttributedRevenue).toBe(298400);
    expect(baseline.kpis.verifiedConversions).toBe(1140);
    expect(baseline.kpis.topConverterChannel.channelName).toBe('Google');
    expect(baseline.kpis.omniAssistedMultiplier.value).toBe(2.8);
    expect(baseline.kpis.incrementalityLiftIndex.valuePct).toBe(24.2);

    // Channels present
    const channelNames = baseline.channels.map((c) => c.channelId);
    expect(channelNames).toContain('google_search');
    expect(channelNames).toContain('meta_ads');
    expect(channelNames).toContain('tiktok_ugc');
    expect(channelNames).toContain('linkedin_enterprise');
    expect(channelNames).toContain('direct_organic');

    // Pathways
    expect(baseline.pathways.length).toBeGreaterThanOrEqual(5);
    expect(baseline.copilot.narrative).toContain('Last-Touch reporting');
  });
});
