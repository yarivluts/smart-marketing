import type { CancellationReasonCode } from './taxonomy';

export type WinbackPlaybook =
  | 'pause_discount'
  | 'smart_dunning'
  | 'executive_outreach'
  | 'adoption_concierge'
  | 'feature_preview'
  | 'support_escalation'
  | 'standard_followup';

export interface WinbackAssessmentOptions {
  mrr?: number;
  tenureMonths?: number;
  hasComment?: boolean;
}

export interface WinbackAssessment {
  score: number; // 0 to 100
  potential: 'high' | 'medium' | 'low';
  recommendedPlaybook: WinbackPlaybook;
  playbookTitle: string;
  playbookAction: string;
  playbookDescription: string;
}

/**
 * Calculates a deterministic winback recovery assessment based on the customer's
 * exit reason code, MRR drag, and feedback attributes.
 *
 * Grounded in SaaS retention dynamics:
 * - Budget/pricing constraints are highly winback-eligible via billing pauses or discounts.
 * - Under-utilization responds well to adoption enablement and templates.
 * - Missing features can be saved if upcoming on the product roadmap.
 * - Competitor switches or high-ARR accounts require high-touch executive concierge.
 * - Service/support breakdowns require rapid support escalation.
 */
export function calculateWinbackScore(
  reasonCode: CancellationReasonCode | string,
  options?: WinbackAssessmentOptions,
): WinbackAssessment {
  const mrr = options?.mrr ?? 0;
  const hasComment = options?.hasComment ?? false;

  let baseScore: number;
  let playbook: WinbackPlaybook;
  let title: string;
  let action: string;
  let description: string;

  switch (reasonCode) {
    case 'too_expensive':
      baseScore = 80;
      playbook = 'pause_discount';
      title = 'Pre-Cancellation Pause Offer';
      action = 'Trigger Pause / 30% Discount';
      description = 'Offer a 1-month billing freeze or 30% discount for 3 months automatically with single-click acceptance.';
      break;

    case 'not_using_enough':
      baseScore = 65;
      playbook = 'adoption_concierge';
      title = 'Adoption & Enablement Concierge';
      action = 'Schedule CS Onboarding';
      description = 'Provide dedicated customer success enablement and pre-built operational templates.';
      break;

    case 'missing_features':
      baseScore = 55;
      playbook = 'feature_preview';
      title = 'Roadmap Beta & Feature Preview';
      action = 'Invite to Beta Roadmap';
      description = 'Connect account with the product roadmap team and grant private beta access to in-flight features.';
      break;

    case 'switched_competitor':
      baseScore = 45;
      playbook = 'executive_outreach';
      title = 'Executive Outreach & High-ACV Alert';
      action = 'Dispatch VIP Calendar Bridge';
      description = 'Escalate account context to leadership with 1-click executive calendar scheduling bridge.';
      break;

    case 'technical_issues':
      baseScore = 50;
      playbook = 'smart_dunning';
      title = 'Technical & Payment Method Remediation';
      action = 'Trigger Technical Support';
      description = 'Automate diagnostic troubleshooting and smart retry payment verification flows.';
      break;

    case 'poor_support':
      baseScore = 35;
      playbook = 'support_escalation';
      title = 'Urgent Support Escalation';
      action = 'Escalate to VP Support';
      description = 'Trigger immediate priority escalation ticket with guaranteed same-day senior leadership review.';
      break;

    case 'other':
    default:
      baseScore = 40;
      playbook = 'standard_followup';
      title = 'Custom Exit Consultation';
      action = 'Send Personal Follow-Up';
      description = 'Send a personalized exit note with an open invitation for feedback and future reactivation.';
      break;
  }

  // Adjust score for high MRR (high revenue at stake justifies aggressive winback)
  let score = baseScore;
  if (mrr >= 1000) {
    playbook = 'executive_outreach';
    title = 'Executive Outreach & High-ACV Alert';
    action = 'Dispatch VIP Calendar Bridge';
    description = 'High-ACV account alert dispatched to leadership with immediate concierge outreach.';
    score = Math.min(95, score + 10);
  } else if (mrr >= 250) {
    score = Math.min(95, score + 5);
  }

  // Articulating a verbatim comment indicates customer engagement (not a silent disengaged churn)
  if (hasComment) {
    score = Math.min(95, score + 5);
  }

  // Clamp score
  score = Math.max(10, Math.min(95, Math.round(score)));

  const potential: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

  return {
    score,
    potential,
    recommendedPlaybook: playbook,
    playbookTitle: title,
    playbookAction: action,
    playbookDescription: description,
  };
}
