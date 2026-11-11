import type { SmartRecommendationCardProps } from '@/components/orgs/smart-recommendation-card';
import type { UnifiedCampaignItem } from '@/lib/orgs/ads-performance-synthesizer';
import type { FunnelStepItem } from '@/lib/orgs/funnel-goals-synthesizer';

/**
 * Proactively inspects active campaigns, conversion funnels, and goal pace
 * to generate prioritized Smart Recommendation Proposals for the Automation Hub.
 *
 * Every recommendation here turns into an approvable action against a real ad account —
 * raising a budget, pausing delivery. So each one may only be raised from a measurement
 * that actually exists: a campaign whose `roas` is null is skipped rather than assumed.
 * `UnifiedCampaignItem` used to guarantee a number for ROAS by deriving it from the daily
 * budget, which meant this function could propose pausing a live campaign as
 * "underperforming" on the strength of a figure nothing had measured.
 */
/** The `ProactiveRecommendations` message namespace's translator (next-intl's `t`), so the text is read in the viewer's language. */
export type RecommendationTranslator = (key: string, values?: Record<string, string | number>) => string;

export function synthesizeProactiveRecommendations(
  t: RecommendationTranslator,
  campaigns: readonly UnifiedCampaignItem[] = [],
  funnelSteps: readonly FunnelStepItem[] = [],
): Omit<SmartRecommendationCardProps, 'onApprove' | 'onDismiss'>[] {
  const recommendations: Omit<SmartRecommendationCardProps, 'onApprove' | 'onDismiss'>[] = [];
  const perDay = (amount: number): string => t('perDay', { amount: `$${amount}` });
  const perMonth = (amount: number): string => `$${amount.toLocaleString('en-US')}`;

  const measured = campaigns.filter(
    (c): c is UnifiedCampaignItem & { roas: number } => typeof c.roas === 'number',
  );

  // 1. High ROAS Budget Scaling (Budget Opportunity)
  const highRoasCampaign = [...measured]
    .filter((c) => c.status === 'enabled' && c.roas >= 3.5)
    .sort((a, b) => b.roas - a.roas)[0];

  if (highRoasCampaign) {
    const nextBudget = Math.round(highRoasCampaign.dailyBudgetUsd * 1.25);
    recommendations.push({
      id: `rec-budget-${highRoasCampaign.targetId}`,
      category: 'budget',
      title: t('budgetTitle'),
      // States only the measured ROAS. "with strong conversion headroom" used to follow it -
      // a claim about demand that nothing here measures.
      description: t('budgetDescription', { campaign: highRoasCampaign.label, roas: highRoasCampaign.roas.toFixed(1) }),
      beforeDiff: perDay(highRoasCampaign.dailyBudgetUsd),
      afterDiff: perDay(nextBudget),
      // No forecast: projecting one needs a performance baseline, and '+28%' was a literal.
      projectedImpact: '',
      actionProposal: {
        actionType: 'budget_change',
        targetId: highRoasCampaign.targetId,
        targetLabel: highRoasCampaign.label,
        beforeValue: perDay(highRoasCampaign.dailyBudgetUsd),
        afterValue: perDay(nextBudget),
        estimatedImpact: '',
        impactBadge: 'high',
        payload: {
          targetId: highRoasCampaign.targetId,
          afterDailyBudgetUsd: nextBudget,
        },
      },
    });
  }

  // 2. Low ROAS Ad Pause / Budget Reallocation (Ad Fatigue / Waste Reduction)
  const lowRoasCampaign = [...measured]
    .filter(
      (c) =>
        c.status === 'enabled' && typeof c.spend30dUsd === 'number' && c.spend30dUsd > 300 && c.roas < 1.8,
    )
    .sort((a, b) => a.roas - b.roas)[0];

  if (lowRoasCampaign) {
    recommendations.push({
      id: `rec-fatigue-${lowRoasCampaign.targetId}`,
      category: 'ad_fatigue',
      title: t('pauseTitle'),
      // No "target": this used to say the campaign was "falling below your 2.5x target
      // threshold" - a target no project ever set (and not even the 1.8x this rule filters on).
      description: t('pauseDescription', { campaign: lowRoasCampaign.label, roas: lowRoasCampaign.roas.toFixed(1) }),
      beforeDiff: t('pauseBefore', { amount: perDay(lowRoasCampaign.dailyBudgetUsd) }),
      afterDiff: t('pauseAfter'),
      projectedImpact: t('pauseImpact', { amount: perMonth(lowRoasCampaign.dailyBudgetUsd * 30) }),
      actionProposal: {
        actionType: 'campaign_activation',
        targetId: lowRoasCampaign.targetId,
        targetLabel: lowRoasCampaign.label,
        beforeValue: t('pauseBeforeValue'),
        afterValue: t('pauseAfterValue'),
        estimatedImpact: t('pauseImpact', { amount: perMonth(lowRoasCampaign.dailyBudgetUsd * 30) }),
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
        title: t('funnelTitle', { stage: highDropoffStep.stageLabel }),
        description: t('funnelDescription', { stage: highDropoffStep.stageLabel, percent: highDropoffStep.dropOffPercent.toFixed(0) }),
        beforeDiff: t('funnelBefore', { percent: highDropoffStep.dropOffPercent.toFixed(0) }),
        afterDiff: t('funnelAfter'),
        projectedImpact: '',
        actionProposal: {
          actionType: 'campaign_draft_create',
          targetId: `target-funnel-${highDropoffStep.stageKey}`,
          targetLabel: t('funnelTargetLabel', { stage: highDropoffStep.stageLabel }),
          beforeValue: t('funnelBeforeValue'),
          afterValue: t('funnelAfterValue', { amount: perDay(150) }),
          estimatedImpact: '',
          impactBadge: 'high',
          payload: {
            campaignName: t('funnelCampaignName', { stage: highDropoffStep.stageLabel }),
            // A starting point for the draft, which the user edits before approving - not a
            // recommended spend derived from anything.
            dailyBudgetUsd: 150,
            platform: 'meta',
          },
        },
      });
    }
  }

  return recommendations;
}
