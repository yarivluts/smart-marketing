import type { SmartRecommendationCardProps } from '@/components/orgs/smart-recommendation-card';
import type { UnifiedCampaignItem } from '@/lib/orgs/ads-performance-synthesizer';
import type { FunnelStepItem } from '@/lib/orgs/funnel-goals-synthesizer';

/**
 * Proactively inspects active campaigns, conversion funnels, and goal pace
 * to generate prioritized Smart Recommendation Proposals for the Automation Hub.
 */
export function synthesizeProactiveRecommendations(
  campaigns: readonly UnifiedCampaignItem[] = [],
  funnelSteps: readonly FunnelStepItem[] = [],
): Omit<SmartRecommendationCardProps, 'onApprove' | 'onDismiss'>[] {
  const recommendations: Omit<SmartRecommendationCardProps, 'onApprove' | 'onDismiss'>[] = [];

  // 1. High ROAS Budget Scaling (Budget Opportunity)
  const highRoasCampaign = [...campaigns]
    .filter((c) => c.status === 'enabled' && c.roas >= 3.5)
    .sort((a, b) => b.roas - a.roas)[0];

  if (highRoasCampaign) {
    const nextBudget = Math.round(highRoasCampaign.dailyBudgetUsd * 1.25);
    recommendations.push({
      id: `rec-budget-${highRoasCampaign.targetId}`,
      category: 'budget',
      title: 'Scale High-Performing Campaign Budget',
      description: `Campaign "${highRoasCampaign.label}" is performing at ${highRoasCampaign.roas.toFixed(1)}x ROAS with strong conversion headroom. Increase daily budget by 25% to capture incremental demand.`,
      beforeDiff: `$${highRoasCampaign.dailyBudgetUsd}/day`,
      afterDiff: `$${nextBudget}/day`,
      projectedImpact: '+28% projected conversions at steady CPA',
      actionProposal: {
        actionType: 'budget_change',
        targetId: highRoasCampaign.targetId,
        targetLabel: highRoasCampaign.label,
        beforeValue: `$${highRoasCampaign.dailyBudgetUsd}/day`,
        afterValue: `$${nextBudget}/day`,
        estimatedImpact: '+28% conversions',
        impactBadge: 'high',
        payload: {
          targetId: highRoasCampaign.targetId,
          afterDailyBudgetUsd: nextBudget,
        },
      },
    });
  }

  // 2. Low ROAS Ad Pause / Budget Reallocation (Ad Fatigue / Waste Reduction)
  const lowRoasCampaign = [...campaigns]
    .filter((c) => c.status === 'enabled' && c.spend30dUsd > 300 && c.roas < 1.8)
    .sort((a, b) => a.roas - b.roas)[0];

  if (lowRoasCampaign) {
    recommendations.push({
      id: `rec-fatigue-${lowRoasCampaign.targetId}`,
      category: 'ad_fatigue',
      title: 'Pause Underperforming Campaign',
      description: `Campaign "${lowRoasCampaign.label}" has generated ${lowRoasCampaign.roas.toFixed(1)}x ROAS over the last 30 days, falling below your 2.5x target threshold. Pause delivery to eliminate spend drain.`,
      beforeDiff: `Status: ENABLED ($${lowRoasCampaign.dailyBudgetUsd}/day)`,
      afterDiff: 'Status: PAUSED ($0/day)',
      projectedImpact: `Saves ~$${(lowRoasCampaign.dailyBudgetUsd * 30).toLocaleString()}/month in inefficient spend`,
      actionProposal: {
        actionType: 'campaign_activation',
        targetId: lowRoasCampaign.targetId,
        targetLabel: lowRoasCampaign.label,
        beforeValue: 'Enabled',
        afterValue: 'Paused',
        estimatedImpact: `Saves $${lowRoasCampaign.dailyBudgetUsd * 30}/month`,
        impactBadge: 'medium',
        payload: {
          targetId: lowRoasCampaign.targetId,
          actionType: 'campaign_pause',
        },
      },
    });
  }

  // 3. Funnel Drop-off Rescue (Drop-off Optimization)
  if (funnelSteps && funnelSteps.length >= 2) {
    const highDropoffStep = funnelSteps.find((s) => s.dropOffPercent > 50);
    if (highDropoffStep) {
      recommendations.push({
        id: `rec-funnel-${highDropoffStep.stageKey}`,
        category: 'funnel_dropoff',
        title: `Recover ${highDropoffStep.stageLabel} Stage Drop-off`,
        description: `Stage "${highDropoffStep.stageLabel}" has a ${highDropoffStep.dropOffPercent.toFixed(0)}% drop-off rate. Deploy a high-intent retargeting campaign to rescue incomplete conversions.`,
        beforeDiff: `Drop-off: ${highDropoffStep.dropOffPercent.toFixed(0)}%`,
        afterDiff: 'Projected: ~35% drop-off',
        projectedImpact: '+35 rescued conversions / month',
        actionProposal: {
          actionType: 'campaign_draft_create',
          targetId: `target-funnel-${highDropoffStep.stageKey}`,
          targetLabel: `${highDropoffStep.stageLabel} Drop-off Recovery`,
          beforeValue: 'No Retargeting',
          afterValue: 'Retargeting ($150/day)',
          estimatedImpact: '+35 conversions/mo',
          impactBadge: 'high',
          payload: {
            campaignName: `${highDropoffStep.stageLabel} Retargeting Leads`,
            dailyBudgetUsd: 150,
            platform: 'meta',
          },
        },
      });
    }
  }

  return recommendations;
}
