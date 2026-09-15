import { describe, expect, it } from 'vitest';
import { processCopilotQuery, type CopilotContext } from './copilot-engine';

/**
 * Every test in this file used to assert the engine's invented output: a budget proposal
 * against "Meta Retargeting Leads" at "$150/day", a rebalance labelled "Shift $500/day from
 * Google to Meta Ads" with a "Blended ROAS" impact, a funnel draft for "EasySign - Viewed
 * Drop-off Retargeting", and an analytics answer asserting "4.2x ROAS". The engine declared a
 * CopilotContext and ignored it, so none of those ids or figures came from anywhere — while
 * the chat panel POSTs an approved proposal to the real automation endpoint.
 */
const CONTEXT: CopilotContext = {
  locale: 'en',
  targets: [
    { id: 'tgt-brand', label: 'EasySign Brand', dailyBudgetUsd: 120, status: 'enabled' },
    { id: 'tgt-retarget', label: 'EasySign Retargeting', dailyBudgetUsd: 80, status: 'paused' },
  ],
};

describe('CopilotEngine NLP & Action Proposals', () => {
  describe('questions that need a measurement it does not have', () => {
    it('declines to rank ads instead of asserting a ROAS figure', () => {
      for (const query of ['What are the top ads this week?', 'אילו מודעות הכי רווחיות השבוע?']) {
        const result = processCopilotQuery(query, CONTEXT);
        expect(result.actionProposal).toBeUndefined();
        expect(result.message.content).toMatch(/no performance data|אין לי עדיין נתוני ביצועים/);
        expect(result.message.content).not.toContain('4.2x');
      }
    });

    it('declines to propose a cross-channel rebalance', () => {
      const result = processCopilotQuery('Reallocate Google to Meta budget', CONTEXT);
      expect(result.actionProposal).toBeUndefined();
      expect(result.message.content).not.toContain('$500');
    });

    it('declines a funnel answer when no funnel steps were supplied', () => {
      const result = processCopilotQuery('Optimize the drop-off', CONTEXT);
      expect(result.actionProposal).toBeUndefined();
      expect(result.message.content).toMatch(/no funnel data/);
    });

    it('answers the funnel question from the steps it is actually given', () => {
      const result = processCopilotQuery('Where is the biggest drop-off?', {
        ...CONTEXT,
        funnelSteps: [
          { stageKey: 'sent', stageLabel: 'Document Sent', dropOffPercent: 0 },
          { stageKey: 'viewed', stageLabel: 'Document Viewed', dropOffPercent: 62 },
          { stageKey: 'signed', stageLabel: 'Document Signed', dropOffPercent: 42 },
        ],
      });
      expect(result.message.content).toContain('Document Viewed');
      expect(result.message.content).toContain('62%');
    });
  });

  describe('actions against campaigns that exist', () => {
    it('builds a budget change from the named campaign and its real current budget', () => {
      const result = processCopilotQuery('Increase budget for EasySign Brand to $250', CONTEXT);
      expect(result.actionProposal?.actionType).toBe('budget_change');
      expect(result.actionProposal?.targetId).toBe('tgt-brand');
      expect(result.actionProposal?.beforeValue).toBe('$120/day');
      expect(result.actionProposal?.afterValue).toBe('$250/day');
      expect(result.actionProposal?.payload.dailyBudgetUsd).toBe(250);
      // No forecast: projecting a result needs a baseline that does not exist.
      expect(result.actionProposal?.estimatedImpact).toBeUndefined();
    });

    it('falls back to the single enabled campaign when the query names none', () => {
      const result = processCopilotQuery('הגדל תקציב ל-350$', { ...CONTEXT, locale: 'he' });
      expect(result.actionProposal?.targetId).toBe('tgt-brand');
      expect(result.actionProposal?.afterValue).toBe('$350/day');
    });

    it('asks which campaign rather than guessing when several are enabled', () => {
      const ambiguous: CopilotContext = {
        locale: 'en',
        targets: [
          { id: 'a', label: 'Campaign A', dailyBudgetUsd: 50, status: 'enabled' },
          { id: 'b', label: 'Campaign B', dailyBudgetUsd: 60, status: 'enabled' },
        ],
      };
      const result = processCopilotQuery('Increase budget to $250', ambiguous);
      expect(result.actionProposal).toBeUndefined();
      expect(result.message.content).toMatch(/which campaign/i);
    });

    it('proposes nothing at all when the project has no campaigns', () => {
      const result = processCopilotQuery('Increase budget to $250', { locale: 'en' });
      expect(result.actionProposal).toBeUndefined();
    });

    it('pauses the campaign the user named, without claiming to have detected a problem', () => {
      const result = processCopilotQuery('Pause EasySign Brand', CONTEXT);
      expect(result.actionProposal?.actionType).toBe('campaign_activation');
      expect(result.actionProposal?.targetId).toBe('tgt-brand');
      expect(result.actionProposal?.afterValue).toBe('PAUSED');
      expect(result.message.content).not.toMatch(/identified|underperforming|sub-par/i);
    });

    it('creates a campaign draft at the budget the user named', () => {
      const result = processCopilotQuery('Create a new campaign for lawyers at 200', CONTEXT);
      expect(result.actionProposal?.actionType).toBe('campaign_draft_create');
      expect(result.actionProposal?.payload.dailyBudgetUsd).toBe(200);
      expect(result.actionProposal?.estimatedImpact).toBeUndefined();
    });

    it('asks for a budget rather than inventing one for a new campaign', () => {
      const result = processCopilotQuery('Create a new campaign for lawyers', CONTEXT);
      expect(result.actionProposal).toBeUndefined();
      expect(result.message.content).toMatch(/daily budget/i);
    });
  });

  it('returns a fallback message when the intent is unrecognized', () => {
    const result = processCopilotQuery('hello growthos', CONTEXT);
    expect(result.message.content).toBe('How can I help you with your campaigns today?');
    expect(result.actionProposal).toBeUndefined();
  });
});
