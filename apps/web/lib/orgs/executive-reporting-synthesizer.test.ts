import { describe, expect, it } from 'vitest';
import {
  buildExecutiveBlendedMetrics,
  buildExecutiveReportData,
  calculateBlendedCac,
  calculateBlendedRoas,
} from './executive-reporting-synthesizer';
import type { AutomationTargetView } from './automation-view';

const META_TARGET: AutomationTargetView = {
  id: 'meta-1',
  targetType: 'campaign',
  label: 'Meta Retargeting',
  dailyBudgetUsd: 100,
  environmentId: 'live',
  externalPlatform: 'meta_ads',
  campaignResourceName: 'meta/campaigns/1',
  campaignStatus: 'enabled',
};

const GOOGLE_TARGET: AutomationTargetView = {
  id: 'google-1',
  targetType: 'campaign',
  label: 'Google Search Brand',
  dailyBudgetUsd: 150,
  environmentId: 'live',
  externalPlatform: 'google_ads',
  campaignResourceName: 'google/campaigns/1',
  campaignStatus: 'enabled',
};

/**
 * This suite used to assert the fabrication: that spend and conversions scaled with the
 * selected time window, and that a rebalancing recommendation was always present — on a
 * project with no targets and no warehouse data at all. Those figures came from a
 * `getDeterministicFactor` hash applied to invented baselines ($8,500 Meta, $5,750 Google,
 * 300 conversions), so the tests passed while the report displayed numbers nobody had
 * measured, under a green "Live Blended Pipeline" badge.
 */
describe('ExecutiveReportingSynthesizer Unit Tests', () => {
  it('returns null rather than zero when CAC and ROAS cannot be computed', () => {
    // Zero conversions is not a free acquisition and zero spend is not an infinite return;
    // both mean the ratio is undefined, which is not the same as it being 0.
    expect(calculateBlendedCac(0, 0)).toBeNull();
    expect(calculateBlendedCac(15000, 0)).toBeNull();
    expect(calculateBlendedCac(15000, 300)).toBe(50.0);

    expect(calculateBlendedRoas(0, 0)).toBeNull();
    expect(calculateBlendedRoas(50000, 0)).toBeNull();
    expect(calculateBlendedRoas(50000, 15000)).toBe(3.33);
  });

  it('reports every metric as null for a project with no targets and no warehouse data', () => {
    for (const timeWindow of ['7d', '30d', '90d'] as const) {
      const metrics = buildExecutiveBlendedMetrics({ timeWindow });

      expect(metrics.totalSpendUsd).toBeNull();
      expect(metrics.metaSpendUsd).toBeNull();
      expect(metrics.googleSpendUsd).toBeNull();
      expect(metrics.blendedCacUsd).toBeNull();
      expect(metrics.blendedRoas).toBeNull();
      expect(metrics.totalConversions).toBeNull();
      expect(metrics.churnRatePct).toBeNull();
      expect(metrics.dunningRecoveryRatePct).toBeNull();
      expect(metrics.conversionVelocityDays).toBeNull();
      // Nothing computes a prior-period baseline, so no change is claimed.
      expect(metrics.periodComparison).toBeUndefined();
    }
  });

  it('reports real warehouse spend, split by platform, and nothing more', () => {
    const metrics = buildExecutiveBlendedMetrics({
      targets: [META_TARGET, GOOGLE_TARGET],
      spendOutcome: {
        ok: true,
        rows: [
          { campaignId: 'meta/campaigns/1', actualSpend: 1200, monthlyBudget: 3000, status: 'on_target' },
          { campaignId: 'google/campaigns/1', actualSpend: 800, monthlyBudget: 4500, status: 'on_target' },
        ],
      },
    });

    expect(metrics.metaSpendUsd).toBe(1200);
    expect(metrics.googleSpendUsd).toBe(800);
    expect(metrics.totalSpendUsd).toBe(2000);

    // Real spend is not a licence to infer what was never measured alongside it.
    expect(metrics.blendedRoas).toBeNull();
    expect(metrics.totalConversions).toBeNull();
    expect(metrics.blendedCacUsd).toBeNull();
  });

  it('emits no channel rows and no rebalancing advice without measured spend', () => {
    const report = buildExecutiveReportData({ timeWindow: '30d' });

    expect(report.channels).toHaveLength(0);
    // The old fixed suggestion — move $500/day from Google to Meta for a "$2,400 projected
    // revenue gain" — quoted ROAS figures nothing had measured, beside an Apply button
    // wired to a real ad account.
    expect(report.rebalancingRecommendation).toBeUndefined();
  });

  it('splits channel percentages to 100 once spend is real', () => {
    const report = buildExecutiveReportData({
      targets: [META_TARGET, GOOGLE_TARGET],
      spendOutcome: {
        ok: true,
        rows: [
          { campaignId: 'meta/campaigns/1', actualSpend: 1500, monthlyBudget: 3000, status: 'on_target' },
          { campaignId: 'google/campaigns/1', actualSpend: 500, monthlyBudget: 4500, status: 'on_target' },
        ],
      },
    });

    expect(report.channels).toHaveLength(2);
    expect(report.channels.reduce((acc, c) => acc + c.percentage, 0)).toBe(100);
    expect(report.channels[0].spendUsd).toBe(1500);
    expect(report.channels[0].roas).toBeNull();
    expect(report.channels[0].cacUsd).toBeNull();
  });

  it('never derives per-channel conversions or ROAS, even when blended figures exist', () => {
    // The previous code derived both, and they were invisible only because their
    // inputs happened to be null - a fabrication armed rather than fixed, which
    // would have started rendering the day a real source landed. Supplying
    // blended figures here is exactly that day.
    const report = buildExecutiveReportData({
      targets: [META_TARGET, GOOGLE_TARGET],
      spendOutcome: {
        ok: true,
        rows: [
          { campaignId: 'meta/campaigns/1', actualSpend: 1500, monthlyBudget: 3000, status: 'on_target' },
          { campaignId: 'google/campaigns/1', actualSpend: 500, monthlyBudget: 4500, status: 'on_target' },
        ],
      },
      overrides: { totalConversions: 400, blendedRoas: 3.2 },
    });

    expect(report.metrics.totalConversions).toBe(400);
    expect(report.metrics.blendedRoas).toBe(3.2);
    for (const channel of report.channels) {
      // Splitting 400 conversions by spend share would attribute them by cost,
      // which is not attribution; copying 3.2x onto both channels would show the
      // same number for each and be true of neither.
      expect(channel.conversions).toBeNull();
      expect(channel.roas).toBeNull();
      expect(channel.cacUsd).toBeNull();
    }
    // Spend and its split are measured, so they survive.
    expect(report.channels[0].spendUsd).toBe(1500);
    expect(report.channels.reduce((acc, c) => acc + c.percentage, 0)).toBe(100);
  });
});
