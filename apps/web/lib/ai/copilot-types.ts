/**
 * Canonical AI Copilot & Action Engine Domain Types
 */

export interface CopilotActionProposal {
  actionType: 'budget_change' | 'campaign_activation' | 'campaign_draft_create' | 'keyword_edit' | 'ad_edit';
  targetId: string;
  targetLabel: string;
  beforeValue: string | number;
  afterValue: string | number;
  /**
   * Optional, because a projection needs a performance baseline and GrowthOS has none yet.
   * It used to be required, which forced every proposal to assert an outcome — "+32%
   * projected conversions", "+45 qualified leads / month", "Blended ROAS increases from
   * 2.31x to 3.66x" — that was a hardcoded literal, not a forecast. `ProposalDiffCard`
   * already renders it conditionally.
   */
  estimatedImpact?: string;
  impactBadge: 'high' | 'medium' | 'low';
  payload: Record<string, unknown>;
  quickExecuteToken?: string;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actionProposal?: CopilotActionProposal;
}

export interface SmartRecommendationCardProps {
  id: string;
  category: 'budget' | 'ad_fatigue' | 'funnel_dropoff' | 'pacing';
  title: string;
  description: string;
  beforeDiff: string;
  afterDiff: string;
  projectedImpact: string;
  actionProposal: CopilotActionProposal;
  onApprove: (proposal: CopilotActionProposal) => Promise<void>;
  onDismiss?: (id: string) => void;
}

/**
 * Executive-level blended figures. Every field is nullable and `null` means "not measured",
 * for the same reason as `UnifiedCampaignItem`: this is the report a founder reads to decide
 * where money goes, and it is the last place that should print a plausible-looking constant.
 *
 * These were all derived from `dailyBudgetUsd` when nothing had been measured — spend as
 * `budget * 30 * 0.88 * factor`, revenue as `spend * 3.6`, and `churnRatePct` /
 * `dunningRecoveryRatePct` / `conversionVelocityDays` as flat constants scaled by a hash of
 * the project id — while the report rendered a green "Live Blended Pipeline" badge over them.
 */
export interface ExecutiveBlendedMetrics {
  totalSpendUsd: number | null;
  metaSpendUsd: number | null;
  googleSpendUsd: number | null;
  blendedCacUsd: number | null;
  blendedRoas: number | null;
  totalConversions: number | null;
  conversionVelocityDays: number | null;
  churnRatePct: number | null;
  dunningRecoveryRatePct: number | null;
  /** Absent until a prior-period baseline is computed; there is no source for one today. */
  periodComparison?: {
    spendChangePct: number;
    cacChangePct: number;
    roasChangePct: number;
    conversionsChangePct?: number;
  };
}
