/**
 * Canonical AI Copilot & Action Engine Domain Types
 */

export interface CopilotActionProposal {
  actionType: 'budget_change' | 'campaign_activation' | 'campaign_draft_create' | 'keyword_edit' | 'ad_edit';
  targetId: string;
  targetLabel: string;
  beforeValue: string | number;
  afterValue: string | number;
  estimatedImpact: string;
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

export interface ExecutiveBlendedMetrics {
  totalSpendUsd: number;
  metaSpendUsd: number;
  googleSpendUsd: number;
  blendedCacUsd: number;
  blendedRoas: number;
  totalConversions: number;
  conversionVelocityDays: number;
  churnRatePct: number;
  dunningRecoveryRatePct: number;
  periodComparison: {
    spendChangePct: number;
    cacChangePct: number;
    roasChangePct: number;
    conversionsChangePct?: number;
  };
}
