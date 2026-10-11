import type { CopilotActionProposal, CopilotMessage } from './copilot-types';

export interface CopilotContext {
  projectId?: string;
  orgId?: string;
  targets?: Array<{ id: string; label: string; dailyBudgetUsd: number; platform?: string; status?: string }>;
  funnelSteps?: Array<{ stageKey: string; stageLabel: string; dropOffPercent: number }>;
}

export interface CopilotEngineResult {
  message: CopilotMessage;
  actionProposal?: CopilotActionProposal;
}

/** The intents the engine recognises, in the order it tests them. */
export const COPILOT_INTENTS = ['topAds', 'budgetChange', 'newCampaign', 'rebalance', 'funnelDropOff', 'pause'] as const;
export type CopilotIntent = (typeof COPILOT_INTENTS)[number];

/**
 * Everything the engine says, and every phrase it listens for, supplied by the caller.
 *
 * The engine is a plain library with no access to next-intl, and the project keeps all
 * user-facing text (and all Hebrew) in `messages/*.json`. So the reply templates and the
 * intent phrases live under the `CopilotEngine` namespace and arrive here already resolved
 * for the active locale - see `buildCopilotEngineMessages`.
 *
 * The intent phrase lists are the same set in `en.json` and `he.json` (each file lists its
 * own language first). That is on purpose: the engine has always understood an English
 * command typed into the Hebrew UI and a Hebrew one typed into the English UI, and moving the
 * phrases into per-locale files must not quietly take that away.
 */
export interface CopilotEngineMessages {
  /** Lower-case phrases; a query matching any phrase of an intent triggers that intent. */
  intents: Record<CopilotIntent, readonly string[]>;
  noPerformanceData: string;
  noCampaign: string;
  askBudgetAmount: (values: { campaign: string }) => string;
  budgetChangeProposed: (values: { campaign: string; before: string; after: string }) => string;
  askNewCampaignBudget: string;
  campaignDraftProposed: (values: { budget: string }) => string;
  noFunnelData: string;
  largestDropOff: (values: { stage: string; percent: string }) => string;
  pauseProposed: (values: { campaign: string; budget: string }) => string;
  fallback: string;
}

/** The two operations `buildCopilotEngineMessages` needs from a next-intl translator. */
export interface CopilotEngineTranslator {
  format: (key: string, values?: Record<string, string>) => string;
  raw: (key: string) => unknown;
}

/**
 * Resolves the `CopilotEngine` namespace into the engine's message object.
 *
 * Throws on a missing or malformed phrase list rather than defaulting to `[]`: an empty list
 * would silently switch an intent off, which reads as "the copilot didn't understand" rather
 * than as the broken translation file it is.
 */
export function buildCopilotEngineMessages(t: CopilotEngineTranslator): CopilotEngineMessages {
  const phrases = (intent: CopilotIntent): string[] => {
    const value = t.raw(`intents.${intent}`);
    if (!Array.isArray(value) || value.length === 0 || !value.every((p) => typeof p === 'string' && p.length > 0)) {
      throw new Error(`CopilotEngine.intents.${intent} must be a non-empty array of non-empty strings`);
    }
    return value.map((p: string) => p.toLowerCase());
  };

  return {
    intents: {
      topAds: phrases('topAds'),
      budgetChange: phrases('budgetChange'),
      newCampaign: phrases('newCampaign'),
      rebalance: phrases('rebalance'),
      funnelDropOff: phrases('funnelDropOff'),
      pause: phrases('pause'),
    },
    noPerformanceData: t.format('noPerformanceData'),
    noCampaign: t.format('noCampaign'),
    askBudgetAmount: (values) => t.format('askBudgetAmount', values),
    budgetChangeProposed: (values) => t.format('budgetChangeProposed', values),
    askNewCampaignBudget: t.format('askNewCampaignBudget'),
    campaignDraftProposed: (values) => t.format('campaignDraftProposed', values),
    noFunnelData: t.format('noFunnelData'),
    largestDropOff: (values) => t.format('largestDropOff', values),
    pauseProposed: (values) => t.format('pauseProposed', values),
    fallback: t.format('fallback'),
  };
}

/**
 * Extracts a numeric budget amount from a query string (e.g. 250, $250, 250/day, or a
 * Hebrew "to 150$" / "150 per day").
 *
 * Deliberately locale-agnostic: it takes the first number in the query. An earlier version
 * wrapped the number in optional currency and per-day tokens in both languages, but every
 * one of them was optional, so they never changed which number was captured - they only put
 * Hebrew into a source file.
 */
function extractBudgetAmount(input: string): number | null {
  const match = input.match(/\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const val = parseFloat(match[0]);
  return isNaN(val) ? null : val;
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
  context: CopilotContext,
  messages: CopilotEngineMessages,
): CopilotEngineResult {
  const input = rawInput.trim();
  const normalized = input.toLowerCase();
  const timestamp = new Date().toISOString();
  const msgId = `asst-${Date.now()}`;

  const matches = (intent: CopilotIntent): boolean =>
    messages.intents[intent].some((phrase) => normalized.includes(phrase));

  const reply = (content: string): CopilotEngineResult => ({
    message: { id: msgId, role: 'assistant', content, timestamp },
  });

  const withProposal = (content: string, actionProposal: CopilotActionProposal): CopilotEngineResult => ({
    message: {
      id: msgId,
      role: 'assistant',
      content,
      timestamp,
      actionProposal,
    },
    actionProposal,
  });

  // 1. Analytics: top performing / best ROAS. Needs measured performance.
  if (matches('topAds')) {
    return reply(messages.noPerformanceData);
  }

  // 2. Budget change. Needs a real campaign; its current budget is a real value.
  if (matches('budgetChange')) {
    const target = resolveTarget(context, normalized);
    if (!target) {
      return reply(messages.noCampaign);
    }

    const amount = extractBudgetAmount(input);
    if (amount === null) {
      return reply(messages.askBudgetAmount({ campaign: target.label }));
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
      messages.budgetChangeProposed({
        campaign: target.label,
        before: String(target.dailyBudgetUsd),
        after: String(amount),
      }),
      actionProposal,
    );
  }

  // 3. Campaign draft creation. Creates something new, so it needs no prior measurement —
  // but it must not promise a result either.
  if (matches('newCampaign')) {
    const dailyBudgetUsd = extractBudgetAmount(input);
    if (dailyBudgetUsd === null) {
      return reply(messages.askNewCampaignBudget);
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

    return withProposal(messages.campaignDraftProposed({ budget: String(dailyBudgetUsd) }), actionProposal);
  }

  // 4. Budget rebalancing. Needs per-channel return figures to argue from.
  if (matches('rebalance')) {
    return reply(messages.noPerformanceData);
  }

  // 5. Funnel drop-off. Real whenever the caller supplied real funnel steps.
  if (matches('funnelDropOff')) {
    const steps = context.funnelSteps ?? [];
    if (steps.length === 0) {
      return reply(messages.noFunnelData);
    }

    const worst = [...steps].sort((a, b) => b.dropOffPercent - a.dropOffPercent)[0];
    return reply(messages.largestDropOff({ stage: worst.stageLabel, percent: String(worst.dropOffPercent) }));
  }

  // 6. Pause. A user naming a campaign is an instruction, not a finding of ours — the
  // proposal is legitimate, but it must not be dressed up as underperformance we detected.
  if (matches('pause')) {
    const target = resolveTarget(context, normalized);
    if (!target) {
      return reply(messages.noCampaign);
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
      messages.pauseProposed({ campaign: target.label, budget: String(target.dailyBudgetUsd) }),
      actionProposal,
    );
  }

  return reply(messages.fallback);
}
