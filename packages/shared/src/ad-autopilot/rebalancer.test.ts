import { describe, expect, it } from 'vitest';
import {
  calculateAutopilotKpis,
  DEFAULT_AUTOPILOT_GUARDRAILS,
  evaluateChannelSpendRebalancing,
  evaluateCreativeFatigueMitigation,
  getBaselineChannels,
} from './rebalancer';
import type { AutopilotChannelPerformance, AutopilotGuardrails } from './types';

describe('ad-autopilot rebalancer', () => {
  it('generates valid baseline channels matching Stitch design 09980af8', () => {
    const channels = getBaselineChannels();
    expect(channels.length).toBe(4);
    expect(channels.find((c) => c.channel === 'google_ads')).toBeDefined();
    expect(channels.find((c) => c.channel === 'meta_ads')).toBeDefined();
    expect(channels.find((c) => c.channel === 'tiktok')).toBeDefined();
    expect(channels.find((c) => c.channel === 'connected_tv')).toBeDefined();

    const totalShare = channels.reduce((sum, c) => sum + c.spendSharePct, 0);
    expect(Math.round(totalShare)).toBe(100);
  });

  it('calculates autopilot KPIs accurately', () => {
    const channels = getBaselineChannels();
    const guardrails: AutopilotGuardrails = { ...DEFAULT_AUTOPILOT_GUARDRAILS };
    const kpis = calculateAutopilotKpis(channels, guardrails);

    expect(kpis.roasVelocity.currentRoas).toBeGreaterThan(3.0);
    expect(kpis.spendCap.dailyCapUsd).toBe(30000);
    expect(kpis.spendCap.activeSpendUsd).toBe(24800);
    expect(kpis.spendCap.capUtilizationPct).toBeCloseTo(82.7, 0);
    expect(kpis.spendCap.pacingStatus).toBe('stable');
    expect(kpis.conversionVelocity.currentVpm).toBeGreaterThan(100);
    expect(kpis.cadenceStability.nominalStatus).toBe('Nominal');
  });

  it('rebalances spend away from underperforming channels towards outperformers', () => {
    const channels: AutopilotChannelPerformance[] = [
      {
        channel: 'google_ads',
        channelLabel: 'Google Ads',
        dailySpendUsd: 10000,
        spendSharePct: 50,
        roas7d: 5.2,
        targetRoas: 4.0,
        cpaUsd: 22,
        targetCpa: 30,
        conversionsPerMin: 60,
        trend: 'up',
        status: 'scaling',
      },
      {
        channel: 'tiktok',
        channelLabel: 'TikTok Pro',
        dailySpendUsd: 10000,
        spendSharePct: 50,
        roas7d: 1.8, // below minRoasFloor (2.5)
        targetRoas: 3.0,
        cpaUsd: 45, // above maxCpaCeiling (35)
        targetCpa: 30,
        conversionsPerMin: 20,
        trend: 'down',
        status: 'throttled',
      },
    ];

    const guardrails: AutopilotGuardrails = {
      dailyCapUsd: 25000,
      minRoasFloor: 2.5,
      maxCpaCeiling: 35.0,
      maxShiftVelocityPct: 15.0, // 15% shift
      killSwitchEngaged: false,
    };

    const { updatedChannels, proposals } = evaluateChannelSpendRebalancing(channels, guardrails);

    expect(proposals.length).toBe(2);

    const tiktokProposal = proposals.find((p) => p.channel === 'tiktok');
    expect(tiktokProposal).toBeDefined();
    expect(tiktokProposal!.deltaUsd).toBe(-1500); // 15% of 10000 trimmed
    expect(tiktokProposal!.proposedDailySpendUsd).toBe(8500);

    const googleProposal = proposals.find((p) => p.channel === 'google_ads');
    expect(googleProposal).toBeDefined();
    expect(googleProposal!.deltaUsd).toBe(1500); // trimmed pool reallocated to Google
    expect(googleProposal!.proposedDailySpendUsd).toBe(11500);

    const updatedGoogle = updatedChannels.find((c) => c.channel === 'google_ads');
    expect(updatedGoogle!.dailySpendUsd).toBe(11500);
    expect(updatedGoogle!.status).toBe('scaling');

    const updatedTiktok = updatedChannels.find((c) => c.channel === 'tiktok');
    expect(updatedTiktok!.dailySpendUsd).toBe(8500);
    expect(updatedTiktok!.status).toBe('throttled');
  });

  it('enforces hard daily spend ceiling when proposed budget exceeds cap', () => {
    const channels: AutopilotChannelPerformance[] = [
      {
        channel: 'google_ads',
        channelLabel: 'Google Ads',
        dailySpendUsd: 20000,
        spendSharePct: 50,
        roas7d: 4.5,
        targetRoas: 4.0,
        cpaUsd: 25,
        targetCpa: 30,
        conversionsPerMin: 50,
        trend: 'up',
        status: 'scaling',
      },
      {
        channel: 'meta_ads',
        channelLabel: 'Meta Reels',
        dailySpendUsd: 20000,
        spendSharePct: 50,
        roas7d: 3.8,
        targetRoas: 3.5,
        cpaUsd: 28,
        targetCpa: 30,
        conversionsPerMin: 40,
        trend: 'up',
        status: 'scaling',
      },
    ];

    const guardrails: AutopilotGuardrails = {
      dailyCapUsd: 30000, // Total 40k exceeds cap 30k
      minRoasFloor: 2.5,
      maxCpaCeiling: 35.0,
      maxShiftVelocityPct: 15.0,
      killSwitchEngaged: false,
    };

    const { updatedChannels } = evaluateChannelSpendRebalancing(channels, guardrails);
    const totalSpend = updatedChannels.reduce((sum, c) => sum + c.dailySpendUsd, 0);
    expect(totalSpend).toBeLessThanOrEqual(30000);
  });

  it('halts all spend and triggers throttle when emergency kill switch is engaged', () => {
    const channels = getBaselineChannels();
    const guardrails: AutopilotGuardrails = {
      ...DEFAULT_AUTOPILOT_GUARDRAILS,
      killSwitchEngaged: true,
    };

    const { updatedChannels, proposals } = evaluateChannelSpendRebalancing(channels, guardrails);
    expect(proposals.length).toBe(channels.length);
    for (const p of proposals) {
      expect(p.proposedDailySpendUsd).toBe(0);
      expect(p.deltaPct).toBe(-100);
      expect(p.reason).toContain('Emergency Kill-Switch');
    }
    for (const c of updatedChannels) {
      expect(c.dailySpendUsd).toBe(0);
      expect(c.status).toBe('throttled');
    }
  });

  it('evaluates creative fatigue and generates auto_swap or throttle proposals', () => {
    const creatives = [
      {
        creativeId: 'cr_1',
        creativeName: 'Video Ad #1 - Testimonial',
        channel: 'meta',
        frequency: 4.8,
        decayPct: 42.5,
      },
      {
        creativeId: 'cr_2',
        creativeName: 'Image Ad #2 - Static Offer',
        channel: 'google',
        frequency: 2.8,
        decayPct: 18.2,
      },
      {
        creativeId: 'cr_3',
        creativeName: 'Video Ad #3 - Fresh UGC',
        channel: 'tiktok',
        frequency: 1.2,
        decayPct: 2.0,
      },
    ];

    const proposals = evaluateCreativeFatigueMitigation(creatives);
    expect(proposals.length).toBe(2);

    const cr1 = proposals.find((p) => p.creativeId === 'cr_1');
    expect(cr1).toBeDefined();
    expect(cr1!.action).toBe('auto_swap');

    const cr2 = proposals.find((p) => p.creativeId === 'cr_2');
    expect(cr2).toBeDefined();
    expect(cr2!.action).toBe('throttle');

    const cr3 = proposals.find((p) => p.creativeId === 'cr_3');
    expect(cr3).toBeUndefined(); // Fresh, no mitigation needed
  });
});
