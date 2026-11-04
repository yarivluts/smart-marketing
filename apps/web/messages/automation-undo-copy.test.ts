import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'rollbackReasonLine',
  'rollbackButton',
  'statusRolledBack',
  'rollbackSuccess',
  'rollbackError',
] as const;

describe('undoing an AI change is described in plain words', () => {
  it('English says "undo", never "roll back"', () => {
    for (const key of KEYS) expect(en.Automation[key], key).not.toMatch(/roll(ed)?\s?back/i);
  });

  it('Hebrew has no English word and speaks to everyone', () => {
    for (const key of KEYS) {
      // Drop the ICU select keywords (reason codes) and placeholders; only the shown sentences remain.
      const shown = he.Automation[key].replace(/\{reason, select,/, '').replace(/\b(?:manual|guardrail_regression|other) \{/g, '{').replace(/\{[^}]*\}/g, '');
      expect(shown, key).not.toMatch(/[A-Za-z]/);
    }
    expect(he.Automation.rollbackError).toMatch(/נסו/);
  });

  it('chooses the sentence by reason, never printing the stored code', () => {
    expect(en.Automation.rollbackReasonLine).toMatch(/\{reason, select,/);
    expect(he.Automation.rollbackReasonLine).toMatch(/\{reason, select,/);
  });
});
