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
 * Extracts a numeric budget amount from a query string (e.g. 250, $250, 250/day, ל-150$).
 */
function extractBudgetAmount(input: string): number | null {
  const match = input.match(/(?:\$|ל-|ל)?\s*(\d+(?:\.\d+)?)\s*(?:\$|\/day|\/יום)?/i);
  if (match && match[1]) {
    const val = parseFloat(match[1]);
    return isNaN(val) ? null : val;
  }
  return null;
}

type CopilotTarget = NonNullable<CopilotContext['targets']>[number];

/**
 * Finds the campaign a query is talking about, among the campaigns that actually exist.
 *
 * Returns null rather than guessing when the project has no campaigns, or when the query
 * names none and there is more than one it could mean. Acting on the wrong campaign is
 * worse than asking which one.
 */
function resolveTarget(context: CopilotContext, normalized: string): CopilotTarget | null {
  const targets = context.targets ?? [];
  if (targets.length === 0) {
    return null;
  }

  const named = targets.find((t) => t.label.length > 2 && normalized.includes(t.label.toLowerCase()));
  if (named) {
    return named;
  }

  const enabled = targets.filter((t) => t.status === 'enabled');
  if (enabled.length === 1) {
    return enabled[0];
  }
  return targets.length === 1 ? targets[0] : null;
}

/**
 * Bilingual intent parsing over the caller's real project context.
 *
 * Every branch that produces an approvable action resolves a campaign that exists, and every
 * branch that would need a performance measurement declines instead — GrowthOS has no
 * impressions, clicks, conversions or revenue source wired up yet, only spend.
 *
 * This engine previously ignored `context` entirely despite declaring it, and every branch
 * returned hardcoded content: a budget proposal against `target-meta-1` / "Meta Retargeting
 * Leads" at "$150/day", a pause proposal against `target-google-low-roas` prefaced with
 * "Identified underperforming campaign with high CAC and sub-par ROAS", a rebalance claiming
 * "Blended ROAS increases from 2.31x to 3.66x", and an analytics answer asserting "4.2x
 * ROAS". None of those ids exist and none of those figures were ever measured — while the
 * chat panel's Approve button POSTs the proposal to the real automation endpoint.
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

  const reply = (en: string, he: string): CopilotEngineResult => ({
    message: { id: msgId, role: 'assistant', content: locale === 'he' ? he : en, timestamp },
  });

  const withProposal = (
    en: string,
    he: string,
    actionProposal: CopilotActionProposal,
  ): CopilotEngineResult => ({
    message: {
      id: msgId,
      role: 'assistant',
      content: locale === 'he' ? he : en,
      timestamp,
      actionProposal,
    },
    actionProposal,
  });

  const noPerformanceData = (): CopilotEngineResult =>
    reply(
      'I have no performance data for this project yet, so I cannot rank campaigns or judge which are underperforming. Connect an ad platform, let the warehouse refresh, then ask again.',
      'אין לי עדיין נתוני ביצועים בפרויקט הזה, ולכן אי אפשר לדרג קמפיינים או לקבוע מי מתפקד פחות טוב. חבר פלטפורמת מודעות, המתן לרענון המחסן, ושאל שוב.',
    );

  const noCampaign = (): CopilotEngineResult =>
    reply(
      'I could not tell which campaign you mean. Name it and I will prepare the change.',
      'לא הצלחתי לזהות לאיזה קמפיין הכוונה. ציין את שמו ואכין את השינוי.',
    );

  // 1. Analytics: top performing / best ROAS. Needs measured performance.
  if (
    normalized.includes('הכי רווחיות') ||
    normalized.includes('המודעות הטובות') ||
    normalized.includes('ביצועים מובילים') ||
    normalized.includes('top ads') ||
    normalized.includes('best ads') ||
    normalized.includes('top performing') ||
    normalized.includes('most profitable')
  ) {
    return noPerformanceData();
  }

  // 2. Budget change. Needs a real campaign; its current budget is a real value.
  if (
    normalized.includes('הגדל תקציב') ||
    normalized.includes('העלה תקציב') ||
    normalized.includes('תקציב ל-') ||
    normalized.includes('תקציב ל') ||
    normalized.includes('increase budget') ||
    normalized.includes('raise budget') ||
    normalized.includes('budget to')
  ) {
    const target = resolveTarget(context, normalized);
    if (!target) {
      return noCampaign();
    }

    const amount = extractBudgetAmount(input);
    if (amount === null) {
      return reply(
        `How much should the daily budget for "${target.label}" be?`,
        `לאיזה סכום להגדיר את התקציב היומי של "${target.label}"?`,
      );
    }

    const actionProposal: CopilotActionProposal = {
      actionType: 'budget_change',
      targetId: target.id,
      targetLabel: target.label,
      beforeValue: `$${target.dailyBudgetUsd}/day`,
      afterValue: `$${amount}/day`,
      // No estimatedImpact: projecting a result needs a performance baseline, and the
      // previous "+32% projected conversions" was a constant with no origin.
      impactBadge: amount > target.dailyBudgetUsd * 1.5 ? 'high' : 'medium',
      payload: { targetId: target.id, dailyBudgetUsd: amount, actionType: 'budget_change' },
      quickExecuteToken: `token-${Date.now()}`,
    };

    return withProposal(
      `Prepared a budget change for "${target.label}", from $${target.dailyBudgetUsd}/day to $${amount}/day.`,
      `הכנתי שינוי תקציב עבור "${target.label}", מ-$${target.dailyBudgetUsd} ליום ל-$${amount} ליום.`,
      actionProposal,
    );
  }

  // 3. Campaign draft creation. Creates something new, so it needs no prior measurement —
  // but it must not promise a result either.
  if (
    normalized.includes('קמפיין חיפוש') ||
    normalized.includes('צור קמפיין') ||
    normalized.includes('קמפיין חדש') ||
    normalized.includes('new campaign') ||
    normalized.includes('create campaign') ||
    normalized.includes('search campaign')
  ) {
    const dailyBudgetUsd = extractBudgetAmount(input);
    if (dailyBudgetUsd === null) {
      return reply(
        'What daily budget should the new campaign start at?',
        'באיזה תקציב יומי להתחיל את הקמפיין החדש?',
      );
    }

    const campaignName = input.slice(0, 80);
    const actionProposal: CopilotActionProposal = {
      actionType: 'campaign_draft_create',
      targetId: `draft-${Date.now()}`,
      targetLabel: campaignName,
      beforeValue: 'None',
      afterValue: `Draft ($${dailyBudgetUsd}/day)`,
      impactBadge: 'medium',
      payload: { platform: 'google_ads', campaignName, dailyBudgetUsd },
      quickExecuteToken: `token-draft-${Date.now()}`,
    };

    return withProposal(
      `Prepared a campaign draft at $${dailyBudgetUsd}/day. Review the creatives before approving.`,
      `הכנתי טיוטת קמפיין בתקציב $${dailyBudgetUsd} ליום. עבור על הקריאייטיבים לפני אישור.`,
      actionProposal,
    );
  }

  // 4. Budget rebalancing. Needs per-channel return figures to argue from.
  if (
    normalized.includes('reallocate') ||
    normalized.includes('rebalance') ||
    normalized.includes('איזון תקציב') ||
    normalized.includes('העבר תקציב') ||
    normalized.includes('חלוקת תקציב') ||
    normalized.includes('shift budget')
  ) {
    return noPerformanceData();
  }

  // 5. Funnel drop-off. Real whenever the caller supplied real funnel steps.
  if (
    normalized.includes('drop-off') ||
    normalized.includes('dropoff') ||
    normalized.includes('נטישה') ||
    normalized.includes('משפך')
  ) {
    const steps = context.funnelSteps ?? [];
    if (steps.length === 0) {
      return reply(
        'I have no funnel data for this project yet.',
        'אין לי עדיין נתוני משפך בפרויקט הזה.',
      );
    }

    const worst = [...steps].sort((a, b) => b.dropOffPercent - a.dropOffPercent)[0];
    return reply(
      `The largest drop-off is at "${worst.stageLabel}", losing ${worst.dropOffPercent}% of the visitors who reach it. Ask me to draft a retargeting campaign for that stage and name a daily budget.`,
      `הנטישה הגדולה ביותר היא בשלב "${worst.stageLabel}", עם ${worst.dropOffPercent}% מהמבקרים שמגיעים אליו. בקש ממני טיוטת קמפיין ריטרגטינג לשלב הזה וציין תקציב יומי.`,
    );
  }

  // 6. Pause. A user naming a campaign is an instruction, not a finding of ours — the
  // proposal is legitimate, but it must not be dressed up as underperformance we detected.
  if (
    normalized.includes('pause') ||
    normalized.includes('עצור') ||
    normalized.includes('השהה') ||
    normalized.includes('cac גבוה') ||
    normalized.includes('high cac') ||
    normalized.includes('ביצועים נמוכים') ||
    normalized.includes('low roas')
  ) {
    const target = resolveTarget(context, normalized);
    if (!target) {
      return noCampaign();
    }

    const actionProposal: CopilotActionProposal = {
      actionType: 'campaign_activation',
      targetId: target.id,
      targetLabel: target.label,
      beforeValue: `ENABLED ($${target.dailyBudgetUsd}/day)`,
      afterValue: 'PAUSED',
      impactBadge: 'medium',
      payload: { targetId: target.id, actionType: 'campaign_pause' },
      quickExecuteToken: `token-pause-${Date.now()}`,
    };

    return withProposal(
      `Ready to pause "${target.label}", currently running at $${target.dailyBudgetUsd}/day.`,
      `מוכן להשהות את "${target.label}", שרץ כעת בתקציב $${target.dailyBudgetUsd} ליום.`,
      actionProposal,
    );
  }

  return reply(
    'How can I help you with your campaigns today?',
    'במה אוכל לעזור לך עם הקמפיינים היום?',
  );
}
