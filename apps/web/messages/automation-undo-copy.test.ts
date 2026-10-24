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
      expect(he.Automation[key].replace(/\{[^}]*\}/g, ""), key).not.toMatch(/[A-Za-z]/);
    }
    expect(he.Automation.rollbackError).toMatch(/נסו/);
  });

  it('keeps the reason placeholder in the reason line', () => {
    expect(en.Automation.rollbackReasonLine).toContain('{reason}');
    expect(he.Automation.rollbackReasonLine).toContain('{reason}');
  });
});
