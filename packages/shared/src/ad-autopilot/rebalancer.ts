import type {
  AutopilotChannelId,
  AutopilotChannelPerformance,
  AutopilotGuardrails,
  AutopilotKpis,
  AutopilotPipelineStage,
  FatigueMitigationProposal,
  RebalanceProposal,
} from './types';

export const DEFAULT_AUTOPILOT_GUARDRAILS: AutopilotGuardrails = {
  dailyCapUsd: 30000,
  minRoasFloor: 2.5,
  maxCpaCeiling: 35.0,
  maxShiftVelocityPct: 15.0,
  killSwitchEngaged: false,
};

export const DEFAULT_PIPELINE_STAGES: AutopilotPipelineStage[] = [
  {
    stageId: 'telemetry_ingest',
    stageNumber: 'Stage 01',
    title: 'Telemetry Ingest',
    description: 'Multi-source telemetry synchronization & validation.',
    durationMs: 124,
    status: 'complete',
  },
  {
    stageId: 'neural_analysis',
    stageNumber: 'Stage 02',
    title: 'Neural Analysis',
    description: 'Deep behavioral inference & audience segmentation.',
    durationMs: 412,
    status: 'complete',
  },
  {
    stageId: 'channel_rebalance',
    stageNumber: 'Stage 03',
    title: 'Channel Rebalancing',
    description: 'Algorithmic cross-platform budget optimization across channels.',
    durationMs: 890,
    status: 'complete',
    progressPct: 100,
  },
  {
    stageId: 'fatigue_mitigation',
    stageNumber: 'Stage 04',
    title: 'Fatigue Mitigation',
    description: 'Asset wear-out detection & automated creative rotation.',
    durationMs: 340,
    status: 'complete',
  },
  {
    stageId: 'live_deployment',
    stageNumber: 'Stage 05',
    title: 'Live Deployment',
    description: 'Final mutation sync with ad network endpoints within guardrail bounds.',
    durationMs: 512,
    status: 'complete',
  },
];

/**
 * Computes synthetic or empirical baseline channels matching Stitch screen 09980af8.
 */
export function getBaselineChannels(): AutopilotChannelPerformance[] {
  return [
    {
      channel: 'google_ads',
      channelLabel: 'Google Ads',
      dailySpendUsd: 10500,
      spendSharePct: 42.3,
      roas7d: 4.82,
      targetRoas: 4.2,
      cpaUsd: 26.5,
      targetCpa: 30.0,
      conversionsPerMin: 68.4,
      trend: 'up',
      status: 'scaling',
    },
    {
      channel: 'meta_ads',
      channelLabel: 'Meta Reels',
      dailySpendUsd: 8200,
      spendSharePct: 33.1,
      roas7d: 3.45,
      targetRoas: 3.5,
      cpaUsd: 31.2,
      targetCpa: 32.0,
      conversionsPerMin: 45.2,
      trend: 'flat',
      status: 'stable',
    },
    {
      channel: 'tiktok',
      channelLabel: 'TikTok Pro',
      dailySpendUsd: 4100,
      spendSharePct: 16.5,
      roas7d: 2.15,
      targetRoas: 3.0,
      cpaUsd: 38.4,
      targetCpa: 32.0,
      conversionsPerMin: 21.0,
      trend: 'down',
      status: 'throttled',
    },
    {
      channel: 'connected_tv',
      channelLabel: 'Connected TV',
      dailySpendUsd: 2000,
      spendSharePct: 8.1,
      roas7d: 2.75,
      targetRoas: 2.5,
      cpaUsd: 34.0,
      targetCpa: 35.0,
      conversionsPerMin: 8.0,
      trend: 'up',
      status: 'stable',
    },
  ];
}

/**
 * Computes Autopilot KPIs across active channels and guardrails.
 */
export function calculateAutopilotKpis(
  channels: AutopilotChannelPerformance[],
  guardrails: AutopilotGuardrails,
): AutopilotKpis {
  const totalSpend = channels.reduce((sum, ch) => sum + ch.dailySpendUsd, 0);
  const totalRevenue = channels.reduce((sum, ch) => sum + ch.dailySpendUsd * ch.roas7d, 0);
  const blendedRoas = totalSpend > 0 ? Number((totalRevenue / totalSpend).toFixed(2)) : 0;

  const targetRoas = 4.2;
  const roasDeltaPct =
    targetRoas > 0 ? Number((((blendedRoas - targetRoas) / targetRoas) * 100).toFixed(1)) : 0;

  let roasStatus: 'optimal' | 'rebalancing' | 'below_floor' = 'optimal';
  if (blendedRoas < guardrails.minRoasFloor) {
    roasStatus = 'below_floor';
  } else if (blendedRoas < targetRoas) {
    roasStatus = 'rebalancing';
  }

  const dailyCap = Math.max(1, guardrails.dailyCapUsd);
  const capUtilizationPct = Number(((totalSpend / dailyCap) * 100).toFixed(1));

  let pacingStatus: 'stable' | 'near_cap' | 'capped' = 'stable';
  if (capUtilizationPct >= 98) {
    pacingStatus = 'capped';
  } else if (capUtilizationPct >= 85) {
    pacingStatus = 'near_cap';
  }

  const totalVpm = Number(
    channels.reduce((sum, ch) => sum + ch.conversionsPerMin, 0).toFixed(1),
  );

  return {
    roasVelocity: {
      currentRoas: blendedRoas,
      targetRoas,
      roasDeltaPct,
      status: roasStatus,
    },
    spendCap: {
      activeSpendUsd: Math.round(totalSpend),
      dailyCapUsd: guardrails.dailyCapUsd,
      capUtilizationPct,
      pacingStatus,
    },
    conversionVelocity: {
      currentVpm: totalVpm,
      targetVpm: 120.0,
      deltaVpm: Number((totalVpm - 120.0).toFixed(1)),
      latencyMs: 14,
    },
    cadenceStability: {
      jitterErrorPct: 0.02,
      nominalStatus: 'Nominal',
      syncPct: 99.8,
    },
  };
}

/**
 * Pure evaluation function that calculates optimal cross-channel spend rebalancing
 * within guardrails (velocity limit, spend ceiling, ROAS floor, CPA ceiling).
 */
export function evaluateChannelSpendRebalancing(
  channels: AutopilotChannelPerformance[],
  guardrails: AutopilotGuardrails,
): {
  updatedChannels: AutopilotChannelPerformance[];
  proposals: RebalanceProposal[];
} {
  if (channels.length === 0) {
    return { updatedChannels: [], proposals: [] };
  }

  if (guardrails.killSwitchEngaged) {
    // If kill switch engaged, freeze or drop spend to zero
    const updatedChannels = channels.map((ch) => ({
      ...ch,
      dailySpendUsd: 0,
      spendSharePct: 0,
      status: 'throttled' as const,
    }));
    const proposals: RebalanceProposal[] = channels.map((ch) => ({
      channel: ch.channel,
      beforeDailySpendUsd: ch.dailySpendUsd,
      proposedDailySpendUsd: 0,
      deltaUsd: -ch.dailySpendUsd,
      deltaPct: -100,
      reason: 'Emergency Kill-Switch Engaged: all autonomous channel spend halted',
      impact: 'Capital fully preserved during emergency pause',
    }));
    return { updatedChannels, proposals };
  }

  const maxShiftPct = Math.min(50, Math.max(1, guardrails.maxShiftVelocityPct));
  let trimmedPoolUsd = 0;

  const underperformingChannels: AutopilotChannelPerformance[] = [];
  const outperformingChannels: AutopilotChannelPerformance[] = [];
  const neutralChannels: AutopilotChannelPerformance[] = [];

  for (const ch of channels) {
    const isRoasBelowFloor = ch.roas7d < guardrails.minRoasFloor;
    const isCpaAboveCeiling = ch.cpaUsd > guardrails.maxCpaCeiling;

    if (isRoasBelowFloor || isCpaAboveCeiling) {
      underperformingChannels.push(ch);
    } else if (ch.roas7d >= ch.targetRoas && ch.cpaUsd <= ch.targetCpa) {
      outperformingChannels.push(ch);
    } else {
      neutralChannels.push(ch);
    }
  }

  const nextSpendMap = new Map<AutopilotChannelId, number>();
  const proposals: RebalanceProposal[] = [];

  // Trim underperforming channels up to maxShiftPct
  for (const ch of underperformingChannels) {
    const trimFraction = maxShiftPct / 100;
    const trimAmount = Math.round(ch.dailySpendUsd * trimFraction);
    const newSpend = Math.max(0, ch.dailySpendUsd - trimAmount);
    trimmedPoolUsd += trimAmount;
    nextSpendMap.set(ch.channel, newSpend);

    const reasons: string[] = [];
    if (ch.roas7d < guardrails.minRoasFloor) {
      reasons.push(`ROAS (${ch.roas7d}x) below floor (${guardrails.minRoasFloor}x)`);
    }
    if (ch.cpaUsd > guardrails.maxCpaCeiling) {
      reasons.push(`CPA ($${ch.cpaUsd}) above ceiling ($${guardrails.maxCpaCeiling})`);
    }

    proposals.push({
      channel: ch.channel,
      beforeDailySpendUsd: ch.dailySpendUsd,
      proposedDailySpendUsd: newSpend,
      deltaUsd: -trimAmount,
      deltaPct: Number((-trimFraction * 100).toFixed(1)),
      reason: `Automated throttle: ${reasons.join(', ')}`,
      impact: `Capped daily exposure by -$${trimAmount.toLocaleString()}`,
    });
  }

  // Boost outperforming channels with trimmed pool
  const totalOutperformerRoas = outperformingChannels.reduce((sum, ch) => sum + ch.roas7d, 0);

  for (const ch of outperformingChannels) {
    const share = totalOutperformerRoas > 0 ? ch.roas7d / totalOutperformerRoas : 1 / outperformingChannels.length;
    const boostAmount = Math.round(trimmedPoolUsd * share);
    const newSpend = ch.dailySpendUsd + boostAmount;
    nextSpendMap.set(ch.channel, newSpend);

    proposals.push({
      channel: ch.channel,
      beforeDailySpendUsd: ch.dailySpendUsd,
      proposedDailySpendUsd: newSpend,
      deltaUsd: boostAmount,
      deltaPct: Number(((boostAmount / Math.max(1, ch.dailySpendUsd)) * 100).toFixed(1)),
      reason: `Automated scale: High ROAS (${ch.roas7d}x vs target ${ch.targetRoas}x)`,
      impact: `Reallocated +$${boostAmount.toLocaleString()} to high-margin channel`,
    });
  }

  // Neutral channels keep current spend
  for (const ch of neutralChannels) {
    nextSpendMap.set(ch.channel, ch.dailySpendUsd);
  }

  // Check if total spend exceeds dailyCapUsd and scale down proportionally if necessary
  const totalProposedSpend = Array.from(nextSpendMap.values()).reduce((sum, val) => sum + val, 0);
  if (totalProposedSpend > guardrails.dailyCapUsd && totalProposedSpend > 0) {
    const scaleFactor = guardrails.dailyCapUsd / totalProposedSpend;
    for (const [chId, spend] of nextSpendMap.entries()) {
      nextSpendMap.set(chId, Math.round(spend * scaleFactor));
    }
  }

  const finalTotalSpend = Math.max(
    1,
    Array.from(nextSpendMap.values()).reduce((sum, val) => sum + val, 0),
  );

  const updatedChannels = channels.map((ch) => {
    const dailySpendUsd = nextSpendMap.get(ch.channel) ?? ch.dailySpendUsd;
    const spendSharePct = Number(((dailySpendUsd / finalTotalSpend) * 100).toFixed(1));

    let status = ch.status;
    if (ch.roas7d < guardrails.minRoasFloor || ch.cpaUsd > guardrails.maxCpaCeiling) {
      status = 'throttled';
    } else if (dailySpendUsd > ch.dailySpendUsd) {
      status = 'scaling';
    } else if (dailySpendUsd < ch.dailySpendUsd) {
      status = 'rebalancing';
    } else {
      status = 'stable';
    }

    return {
      ...ch,
      dailySpendUsd,
      spendSharePct,
      status,
    };
  });

  return { updatedChannels, proposals };
}

/**
 * Pure function evaluating ad creative decay rate and frequency saturation to
 * produce automated wear-out mitigation proposals.
 */
export function evaluateCreativeFatigueMitigation(
  creatives: Array<{
    creativeId: string;
    creativeName: string;
    channel: string;
    frequency: number;
    decayPct: number;
  }>,
): FatigueMitigationProposal[] {
  const proposals: FatigueMitigationProposal[] = [];

  for (const cr of creatives) {
    if (cr.decayPct >= 35 || cr.frequency >= 4.0) {
      proposals.push({
        creativeId: cr.creativeId,
        creativeName: cr.creativeName,
        channel: cr.channel,
        action: 'auto_swap',
        frequency: cr.frequency,
        decayPct: cr.decayPct,
        reason: `Fatigued asset: ${cr.decayPct}% CTR decay and ${cr.frequency}x frequency. Automated swap to fresh asset recommended.`,
      });
    } else if (cr.decayPct >= 15 || cr.frequency >= 2.5) {
      proposals.push({
        creativeId: cr.creativeId,
        creativeName: cr.creativeName,
        channel: cr.channel,
        action: 'throttle',
        frequency: cr.frequency,
        decayPct: cr.decayPct,
        reason: `Wearing out: ${cr.decayPct}% CTR drop. Spend throttled to decelerate audience saturation.`,
      });
    }
  }

  return proposals;
}
