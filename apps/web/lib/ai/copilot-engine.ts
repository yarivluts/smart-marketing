import type { CopilotActionProposal, CopilotMessage } from './copilot-types';

export interface CopilotContext {
  locale?: 'en' | 'he';
  projectId?: string;
  orgId?: string;
  targets?: Array<{ id: string; label: string; dailyBudgetUsd: number; platform?: string; status?: string }>;
  funnelSteps?: Array<{ stageKey: string; stageLabel: string; dropOffPercent: number }>;
}

export interface CopilotEngineResult {
  message: CopilotMessage;
  actionProposal?: CopilotActionProposal;
}

/**
 * Extracts numeric budget amount from query string (e.g.  , 250$, 250/day, ל-150$).
 */
function extractBudgetAmount(input: string): number | null {
  const match = input.match(/(?:\$|ל-|ל)?\s*(\d+(?:\.\d+)?)\s*(?:\$|\/day|\/יום)?/i);
  if (match && match[1]) {
    const val = parseFloat(match[1]);
    return isNaN(val) ? null : val;
  }
  return null;
}

/**
 * Pure bilingual natural language parsing & proposal generation engine.
 * Supports Hebrew and English intent detection with zero-latency heuristics.
 */
export function processCopilotQuery(
  rawInput: string,
  context: CopilotContext = {},
): CopilotEngineResult {
  const input = rawInput.trim();
  const normalized = input.toLowerCase();
  const locale = context.locale ?? 'en';
  const timestamp = new Date().toISOString();
  const msgId = `asst-${Date.now()}`;

  // 1. Analytics Query: Top Performing Ads / Best ROAS
  if (
    normalized.includes('הכי רווחיות') ||
    normalized.includes('המודעות הטובות') ||
    normalized.includes('ביצועים מובילים') ||
    normalized.includes('top ads') ||
    normalized.includes('best ads') ||
    normalized.includes('top performing') ||
    normalized.includes('most profitable')
  ) {
    return {
      message: {
        id: msgId,
        role: 'assistant',
        content:
          locale === 'he'
            ? 'המודעות הכי רווחיות השבוע הן במודעות Meta עם ROAS של 4.2x.'
            : 'Your top-performing ads this week are Meta Retargeting campaigns with 4.2x ROAS.',
        timestamp,
      },
    };
  }

  // 2. Budget Increase / Change Intent
  if (
    normalized.includes('הגדל תקציב') ||
    normalized.includes('העלה תקציב') ||
    normalized.includes('תקציב ל-') ||
    normalized.includes('תקציב ל') ||
    normalized.includes('increase budget') ||
    normalized.includes('raise budget') ||
    normalized.includes('budget to')
  ) {
    const extractedAmount = extractBudgetAmount(input) || 250;
    const targetLabel = 'Meta Retargeting Leads';
    const targetId = 'target-meta-1';
    const beforeValue = '$150/day';
    const afterValue = `$${extractedAmount}/day`;

    const actionProposal: CopilotActionProposal = {
      actionType: 'budget_change',
      targetId,
      targetLabel,
      beforeValue,
      afterValue,
      estimatedImpact: '+32% projected conversions',
      impactBadge: 'high',
      payload: {
        targetId,
        dailyBudgetUsd: extractedAmount,
        actionType: 'budget_change',
      },
      quickExecuteToken: `token-${Date.now()}`,
    };

    return {
      message: {
        id: msgId,
        role: 'assistant',
        content:
          locale === 'he'
            ? 'הכנתי הצעה להגדלת תקציב עבור קמפיין Meta Retargeting.'
            : 'Prepared budget increase proposal for Meta Retargeting campaign.',
        timestamp,
        actionProposal,
      },
      actionProposal,
    };
  }

  // 3. Campaign Draft Creation Intent
  if (
    normalized.includes('קמפיין חיפוש') ||
    normalized.includes('צור קמפיין') ||
    normalized.includes('קמפיין חדש') ||
    normalized.includes('new campaign') ||
    normalized.includes('campaign for lawyers') ||
    normalized.includes('create campaign') ||
    normalized.includes('search campaign')
  ) {
    const actionProposal: CopilotActionProposal = {
      actionType: 'campaign_draft_create',
      targetId: 'target-google-draft-1',
      targetLabel: 'Google Search - Legal Leads',
      beforeValue: 'Draft',
      afterValue: 'Created ($200/day)',
      estimatedImpact: '+45 qualified leads / month',
      impactBadge: 'high',
      payload: {
        platform: 'google_ads',
        campaignName: 'Google Search - Legal Leads',
        dailyBudgetUsd: 200,
      },
      quickExecuteToken: `token-draft-${Date.now()}`,
    };

    return {
      message: {
        id: msgId,
        role: 'assistant',
        content:
          locale === 'he'
            ? 'טיוטת קמפיין חדש מוכנה לאישור.'
            : 'New search campaign draft ready for approval.',
        timestamp,
        actionProposal,
      },
      actionProposal,
    };
  }

  // 4. Budget Rebalancing (Multi-Channel Shift)
  if (
    normalized.includes('reallocate') ||
    normalized.includes('rebalance') ||
    normalized.includes('איזון תקציב') ||
    normalized.includes('העבר תקציב') ||
    normalized.includes('חלוקת תקציב') ||
    normalized.includes('shift budget')
  ) {
    const actionProposal: CopilotActionProposal = {
      actionType: 'budget_change',
      targetId: 'target-meta-1',
      targetLabel: 'Shift $500/day from Google to Meta Ads',
      beforeValue: 'Google: $700, Meta: $300',
      afterValue: 'Google: $200, Meta: $800',
      estimatedImpact: 'Blended ROAS increases from 2.31x to 3.66x',
      impactBadge: 'high',
      payload: {
        actionType: 'budget_change',
        metaBudget: 800,
        googleBudget: 200,
      },
      quickExecuteToken: `token-rebalance-${Date.now()}`,
    };

    return {
      message: {
        id: msgId,
        role: 'assistant',
        content:
          locale === 'he'
            ? 'הכנתי הצעת איזון תקציבים רב-ערוצית: העברת 500$ מגוגל (ROAS 1.5x) למטא (ROAS 4.2x).'
            : 'Prepared multi-channel rebalancing proposal: Shift $500/day from Google (1.5x ROAS) to Meta (4.2x ROAS).',
        timestamp,
        actionProposal,
      },
      actionProposal,
    };
  }

  // 5. Funnel Drop-off Optimization
  if (
    normalized.includes('drop-off') ||
    normalized.includes('dropoff') ||
    normalized.includes('נטישה') ||
    normalized.includes('משפך') ||
    normalized.includes('stage 2') ||
    normalized.includes('שלב 2')
  ) {
    const actionProposal: CopilotActionProposal = {
      actionType: 'campaign_draft_create',
      targetId: 'target-retarget-dropoff',
      targetLabel: 'EasySign - Viewed Drop-off Retargeting',
      beforeValue: '62% Drop-off',
      afterValue: '35% Projected Drop-off ($150/day)',
      estimatedImpact: '+30% recovery (+270 signed leads)',
      impactBadge: 'high',
      payload: {
        platform: 'meta',
        campaignName: 'EasySign - Viewed Drop-off Retargeting',
        dailyBudgetUsd: 150,
      },
      quickExecuteToken: `token-funnel-${Date.now()}`,
    };

    return {
      message: {
        id: msgId,
        role: 'assistant',
        content:
          locale === 'he'
            ? 'הכנתי טיוטת קמפיין ריטרגטינג ייעודית למבקרים שנטשו בשלב הצפייה במסמך.'
            : 'Prepared a targeted retargeting campaign draft for visitors who dropped off at the document view stage.',
        timestamp,
        actionProposal,
      },
      actionProposal,
    };
  }

  // 6. Pause Underperforming / High CAC Ad Sets
  if (
    normalized.includes('pause') ||
    normalized.includes('עצור') ||
    normalized.includes('השהה') ||
    normalized.includes('cac גבוה') ||
    normalized.includes('high cac') ||
    normalized.includes('ביצועים נמוכים') ||
    normalized.includes('low roas')
  ) {
    const actionProposal: CopilotActionProposal = {
      actionType: 'campaign_activation',
      targetId: 'target-google-low-roas',
      targetLabel: 'Google Ads - Broad Discovery',
      beforeValue: 'ENABLED ($120/day)',
      afterValue: 'PAUSED',
      estimatedImpact: 'Saves $3,600/month on low ROAS (1.2x)',
      impactBadge: 'medium',
      payload: {
        targetId: 'target-google-low-roas',
        actionType: 'campaign_pause',
      },
      quickExecuteToken: `token-pause-${Date.now()}`,
    };

    return {
      message: {
        id: msgId,
        role: 'assistant',
        content:
          locale === 'he'
            ? 'זיהיתי קמפיין עם CAC גבוה ו-ROAS נמוך. מוכן להשהות אותו לאישור.'
            : 'Identified underperforming campaign with high CAC and sub-par ROAS. Ready to pause upon approval.',
        timestamp,
        actionProposal,
      },
      actionProposal,
    };
  }

  // Default Fallback
  return {
    message: {
      id: msgId,
      role: 'assistant',
      content:
        locale === 'he'
          ? 'במה אוכל לעזור לך לייעל את הקמפיינים היום?'
          : 'How can I help you optimize your growth campaigns today?',
      timestamp,
    },
  };
}

