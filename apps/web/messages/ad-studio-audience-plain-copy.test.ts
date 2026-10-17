import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const JARGON = /\b(reach estimate|placement|meta interests?|targets?)\b/i;

describe('Ad Studio audience step copy', () => {
  it('describes the audience in plain English without marketing jargon', () => {
    const a = en.AdStudio.audience;
    for (const text of [a.description, a.interestPlaceholder, a.noInterests, a.estimate, a.breakdowns.placement]) {
      expect(text).not.toMatch(JARGON);
    }
    expect(a.description).toMatch(/who will see your ad/i);
  });

  it('keeps the Hebrew in step with the English wording', () => {
    const a = he.AdStudio.audience;
    expect(a.description).toContain('מי יראו את המודעה');
    expect(a.estimate).toBe('כמה אנשים יכולים לראות');
    expect(a.breakdowns.placement).toBe('היכן המודעה הוצגה');
    expect(a.noInterests).not.toContain('מטא');
  });
});
