import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['chipScaleBudgetLabel', 'chipScaleBudgetQuery', 'chipRebalanceLabel'] as const;

describe('the copilot quick-prompt chips speak plain words', () => {
  it('English chips avoid retargeting / scale / rebalance jargon', () => {
    for (const key of KEYS) {
      expect(en.CopilotChatPanel[key], key).not.toMatch(/retarget|scale|rebalance/i);
    }
  });

  it('Hebrew chips avoid the transliterated retargeting', () => {
    for (const key of KEYS) {
      expect(he.CopilotChatPanel[key], key).not.toMatch(/ריטרגטינג|איזון/);
    }
  });
});

describe('the AI helper chips and tabs speak to everyone in plain words', () => {
  it('Hebrew chip prompts use the plural imperative, not the masculine singular', () => {
    expect(he.CopilotChatPanel.chipScaleBudgetQuery).toMatch(/^הגדילו /);
    expect(he.CopilotChatPanel.chipRebalanceQuery).toMatch(/^העבירו /);
    expect(he.CopilotChatPanel.chipScaleBudgetLabel).not.toMatch(/^הגדל /);
  });

  it('the history tab is not called an audit trail in either language', () => {
    expect(en.AutomationHub.tabAudit).not.toMatch(/audit/i);
    expect(he.AutomationHub.tabAudit).not.toMatch(/audit|ביקורת/i);
  });
});

describe('the AI helper confirmations point to Change history, not the audit log', () => {
  const KEYS = ['actionExecuted', 'actionFailed', 'actionExecutedSuccess', 'executing'] as const;

  it('English avoids audit log / roll back / execute wording', () => {
    for (const key of KEYS) {
      expect(en.Copilot[key], key).not.toMatch(/audit|roll ?back|execut/i);
    }
    expect(en.Copilot.actionExecuted).toContain('Change history');
  });

  it('Hebrew avoids the audit-log wording', () => {
    for (const key of KEYS) {
      expect(he.Copilot[key], key).not.toMatch(/ביקורת/);
    }
    expect(he.Copilot.actionExecuted).toContain('היסטוריית שינויים');
  });
});
