import { describe, expect, it } from 'vitest';
import {
  COPILOT_INTENTS,
  buildCopilotEngineMessages,
  processCopilotQuery,
  type CopilotContext,
} from './copilot-engine';
import { copilotEngineMessages, copilotEngineTranslator } from '@/tests/e2e/helpers/test-harness';

/**
 * Every test in this file used to assert the engine's invented output: a budget proposal
 * against "Meta Retargeting Leads" at "$150/day", a rebalance labelled "Shift $500/day from
 * Google to Meta Ads" with a "Blended ROAS" impact, a funnel draft for "EasySign - Viewed
 * Drop-off Retargeting", and an analytics answer asserting "4.2x ROAS". The engine declared a
 * CopilotContext and ignored it, so none of those ids or figures came from anywhere — while
 * the chat panel POSTs an approved proposal to the real automation endpoint.
 *
 * The engine's replies and intent phrases live in `messages/{en,he}.json` under
 * `CopilotEngine`; these tests build them from the real bundles, and read every expected
 * Hebrew reply out of `he.json` rather than restating it.
 */
const CONTEXT: CopilotContext = {
  targets: [
    { id: 'tgt-brand', label: 'EasySign Brand', dailyBudgetUsd: 120, status: 'enabled' },
    { id: 'tgt-retarget', label: 'EasySign Retargeting', dailyBudgetUsd: 80, status: 'paused' },
  ],
};

const EN = copilotEngineMessages('en');
const HE = copilotEngineMessages('he');
const heT = copilotEngineTranslator('he');
const enT = copilotEngineTranslator('en');

describe('CopilotEngine NLP & Action Proposals', () => {
  describe('questions that need a measurement it does not have', () => {
    it('declines to rank ads instead of asserting a ROAS figure', () => {
      for (const query of ['What are the top ads this week?', 'אילו מודעות הכי רווחיות השבוע?']) {
        const result = processCopilotQuery(query, CONTEXT, EN);
        expect(result.actionProposal).toBeUndefined();
        expect(result.message.content).toBe(enT.format('noPerformanceData'));
        expect(result.message.content).not.toContain('4.2x');
      }
    });

    it('declines to propose a cross-channel rebalance', () => {
      const result = processCopilotQuery('Reallocate Google to Meta budget', CONTEXT, EN);
      expect(result.actionProposal).toBeUndefined();
      expect(result.message.content).not.toContain('$500');
    });

    it('declines a funnel answer when no funnel steps were supplied', () => {
      const result = processCopilotQuery('Optimize the drop-off', CONTEXT, EN);
      expect(result.actionProposal).toBeUndefined();
      expect(result.message.content).toMatch(/no funnel data/);
    });

    it('answers the funnel question from the steps it is actually given', () => {
      const result = processCopilotQuery(
        'Where is the biggest drop-off?',
        {
          ...CONTEXT,
          funnelSteps: [
            { stageKey: 'sent', stageLabel: 'Document Sent', dropOffPercent: 0 },
            { stageKey: 'viewed', stageLabel: 'Document Viewed', dropOffPercent: 62 },
            { stageKey: 'signed', stageLabel: 'Document Signed', dropOffPercent: 42 },
          ],
        },
        EN,
      );
      expect(result.message.content).toBe(
        'The largest drop-off is at "Document Viewed", losing 62% of the visitors who reach it. Ask me to draft a retargeting campaign for that stage and name a daily budget.',
      );
    });
  });

  describe('actions against campaigns that exist', () => {
    it('builds a budget change from the named campaign and its real current budget', () => {
      const result = processCopilotQuery('Increase budget for EasySign Brand to $250', CONTEXT, EN);
      expect(result.actionProposal?.actionType).toBe('budget_change');
      expect(result.actionProposal?.targetId).toBe('tgt-brand');
      expect(result.actionProposal?.beforeValue).toBe('$120/day');
      expect(result.actionProposal?.afterValue).toBe('$250/day');
      expect(result.actionProposal?.payload.dailyBudgetUsd).toBe(250);
      expect(result.message.content).toBe('Prepared a budget change for "EasySign Brand", from $120/day to $250/day.');
      // No forecast: projecting a result needs a baseline that does not exist.
      expect(result.actionProposal?.estimatedImpact).toBeUndefined();
    });

    it('falls back to the single enabled campaign when the query names none', () => {
      const result = processCopilotQuery('הגדל תקציב ל-350$', CONTEXT, HE);
      expect(result.actionProposal?.targetId).toBe('tgt-brand');
      expect(result.actionProposal?.afterValue).toBe('$350/day');
    });

    it('asks which campaign rather than guessing when several are enabled', () => {
      const ambiguous: CopilotContext = {
        targets: [
          { id: 'a', label: 'Campaign A', dailyBudgetUsd: 50, status: 'enabled' },
          { id: 'b', label: 'Campaign B', dailyBudgetUsd: 60, status: 'enabled' },
        ],
      };
      const result = processCopilotQuery('Increase budget to $250', ambiguous, EN);
      expect(result.actionProposal).toBeUndefined();
      expect(result.message.content).toMatch(/which campaign/i);
    });

    it('proposes nothing at all when the project has no campaigns', () => {
      const result = processCopilotQuery('Increase budget to $250', {}, EN);
      expect(result.actionProposal).toBeUndefined();
    });

    it('asks for an amount, naming the campaign, when the budget query has no number', () => {
      const result = processCopilotQuery('Increase budget for EasySign Brand', CONTEXT, EN);
      expect(result.actionProposal).toBeUndefined();
      expect(result.message.content).toBe('How much should the daily budget for "EasySign Brand" be?');
    });

    it('pauses the campaign the user named, without claiming to have detected a problem', () => {
      const result = processCopilotQuery('Pause EasySign Brand', CONTEXT, EN);
      expect(result.actionProposal?.actionType).toBe('campaign_activation');
      expect(result.actionProposal?.targetId).toBe('tgt-brand');
      expect(result.actionProposal?.afterValue).toBe('PAUSED');
      expect(result.message.content).toBe('Ready to pause "EasySign Brand", currently running at $120/day.');
      expect(result.message.content).not.toMatch(/identified|underperforming|sub-par/i);
    });

    it('creates a campaign draft at the budget the user named', () => {
      const result = processCopilotQuery('Create a new campaign for lawyers at 200', CONTEXT, EN);
      expect(result.actionProposal?.actionType).toBe('campaign_draft_create');
      expect(result.actionProposal?.payload.dailyBudgetUsd).toBe(200);
      expect(result.actionProposal?.estimatedImpact).toBeUndefined();
      expect(result.message.content).toBe('Prepared a campaign draft at $200/day. Review the creatives before approving.');
    });

    it('asks for a budget rather than inventing one for a new campaign', () => {
      const result = processCopilotQuery('Create a new campaign for lawyers', CONTEXT, EN);
      expect(result.actionProposal).toBeUndefined();
      expect(result.message.content).toMatch(/daily budget/i);
    });
  });

  it('returns a fallback message when the intent is unrecognized', () => {
    const result = processCopilotQuery('hello growthos', CONTEXT, EN);
    expect(result.message.content).toBe('How can I help you with your campaigns today?');
    expect(result.actionProposal).toBeUndefined();
  });

  /**
   * The Hebrew replies and the Hebrew intent phrases used to be string literals in the engine.
   * They moved to `he.json`; these pin that the Hebrew path still says exactly what it said
   * and still recognises the same commands.
   */
  describe('the Hebrew path', () => {
    it('replies in Hebrew, with every value interpolated, for each branch', () => {
      const funnel: CopilotContext = {
        ...CONTEXT,
        funnelSteps: [
          { stageKey: 'sent', stageLabel: 'Document Sent', dropOffPercent: 10 },
          { stageKey: 'viewed', stageLabel: 'Document Viewed', dropOffPercent: 62 },
        ],
      };
      const cases: Array<[string, CopilotContext, string]> = [
        ['אילו מודעות הכי רווחיות השבוע?', CONTEXT, heT.format('noPerformanceData')],
        ['הגדל תקציב', { targets: [] }, heT.format('noCampaign')],
        ['הגדל תקציב', CONTEXT, heT.format('askBudgetAmount', { campaign: 'EasySign Brand' })],
        [
          'הגדל תקציב ל-400$',
          CONTEXT,
          heT.format('budgetChangeProposed', { campaign: 'EasySign Brand', before: '120', after: '400' }),
        ],
        ['צור קמפיין חדש לעורכי דין', CONTEXT, heT.format('askNewCampaignBudget')],
        ['צור קמפיין חדש לעורכי דין בתקציב 200', CONTEXT, heT.format('campaignDraftProposed', { budget: '200' })],
        ['איזון תקציב בין גוגל למטא', CONTEXT, heT.format('noPerformanceData')],
        ['איפה יש נטישה?', CONTEXT, heT.format('noFunnelData')],
        ['איפה יש נטישה במשפך?', funnel, heT.format('largestDropOff', { stage: 'Document Viewed', percent: '62' })],
        ['השהה קמפיין', CONTEXT, heT.format('pauseProposed', { campaign: 'EasySign Brand', budget: '120' })],
        ['שלום', CONTEXT, heT.format('fallback')],
      ];

      for (const [query, context, expected] of cases) {
        const content = processCopilotQuery(query, context, HE).message.content;
        expect({ query, content }).toEqual({ query, content: expected });
      }
    });

    it('renders the interpolated Hebrew templates in full, not as a key path or a raw placeholder', () => {
      const content = processCopilotQuery('הגדל תקציב ל-400$', CONTEXT, HE).message.content;
      expect(content).toContain('"EasySign Brand"');
      expect(content).toContain('$120');
      expect(content).toContain('$400');
      expect(content).not.toMatch(/[{}]|CopilotEngine\./);
    });

    it('detects every Hebrew intent phrase from he.json', () => {
      const expectations: Record<(typeof COPILOT_INTENTS)[number], string> = {
        topAds: heT.format('noPerformanceData'),
        budgetChange: heT.format('askBudgetAmount', { campaign: 'EasySign Brand' }),
        newCampaign: heT.format('askNewCampaignBudget'),
        rebalance: heT.format('noPerformanceData'),
        funnelDropOff: heT.format('noFunnelData'),
        pause: heT.format('pauseProposed', { campaign: 'EasySign Brand', budget: '120' }),
      };
      for (const intent of COPILOT_INTENTS) {
        const hebrewPhrases = HE.intents[intent].filter((phrase) => /[֐-׿]/.test(phrase));
        expect({ intent, hasHebrew: hebrewPhrases.length > 0 }).toEqual({ intent, hasHebrew: true });
        for (const phrase of hebrewPhrases) {
          const content = processCopilotQuery(phrase, CONTEXT, HE).message.content;
          expect({ intent, phrase, content }).toEqual({ intent, phrase, content: expectations[intent] });
        }
      }
    });

    it('still understands English commands typed into the Hebrew UI, and Hebrew typed into the English one', () => {
      const enInHe = processCopilotQuery('Pause EasySign Brand', CONTEXT, HE);
      expect(enInHe.actionProposal?.targetId).toBe('tgt-brand');
      expect(enInHe.message.content).toBe(heT.format('pauseProposed', { campaign: 'EasySign Brand', budget: '120' }));

      const heInEn = processCopilotQuery('השהה קמפיין', CONTEXT, EN);
      expect(heInEn.actionProposal?.targetId).toBe('tgt-brand');
      expect(heInEn.message.content).toBe('Ready to pause "EasySign Brand", currently running at $120/day.');
    });
  });

  describe('intent phrases', () => {
    it('are the same set in en.json and he.json, so recognition does not depend on the UI locale', () => {
      for (const intent of COPILOT_INTENTS) {
        expect({ intent, phrases: [...EN.intents[intent]].sort() }).toEqual({
          intent,
          phrases: [...HE.intents[intent]].sort(),
        });
      }
    });

    it('keep the order the engine tests intents in', () => {
      // This matches both "budget to" (budget change) and "new campaign" (draft). Budget
      // change has always won because it is tested first.
      const result = processCopilotQuery('new campaign with budget to 50', CONTEXT, EN);
      expect(result.actionProposal?.actionType).toBe('budget_change');
    });

    it('fails loudly when a phrase list is missing, instead of silently disabling an intent', () => {
      expect(() =>
        buildCopilotEngineMessages({
          format: (key) => key,
          raw: (key) => (key === 'intents.pause' ? undefined : ['x']),
        }),
      ).toThrow(/CopilotEngine\.intents\.pause/);
    });
  });

  describe('budget amounts', () => {
    it.each([
      ['Increase budget to 250', 250],
      ['Increase budget to $250', 250],
      ['Increase budget to 250/day', 250],
      ['Increase budget to $99.5/day', 99.5],
      ['הגדל תקציב ל-150$', 150],
      ['הגדל תקציב ל150', 150],
      ['הגדל תקציב ל- 175 /יום', 175],
    ])('reads %s as %d in either locale', (query, amount) => {
      for (const messages of [EN, HE]) {
        const result = processCopilotQuery(query, CONTEXT, messages);
        expect(result.actionProposal?.payload.dailyBudgetUsd).toBe(amount);
      }
    });
  });
});
