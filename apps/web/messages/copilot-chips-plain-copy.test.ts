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
