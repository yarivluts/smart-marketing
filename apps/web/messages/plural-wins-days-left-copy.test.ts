import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

function fmt(locale: 'en' | 'he', pattern: string, values: Record<string, number>): string {
  const t = createTranslator({ locale, messages: { m: pattern } });
  return t('m', values);
}

describe('wins list and goal deadline: proper singular and plural', () => {
  const copy = { en: en as unknown as Copy, he: he as unknown as Copy };

  it('en: one win and one day read naturally, no "win(s)" or "1d"', () => {
    const wins = copy.en.WinRules.historyListCapNote;
    expect(fmt('en', wins, { count: 1 })).toBe('Showing your most recent win.');
    expect(fmt('en', wins, { count: 2 })).toBe('Showing the most recent 2 wins.');
    expect(fmt('en', copy.en.WinRules.historyListCapNoteTruncated, { count: 1 })).toBe('Showing your most recent win — more exist than are shown.');
    const days = copy.en.Goals.timeElapsed;
    expect(fmt('en', days, { percent: 60, daysRemaining: 1 })).toBe('60% elapsed (1 day left)');
    expect(fmt('en', days, { percent: 60, daysRemaining: 30 })).toBe('60% elapsed (30 days left)');
    expect(wins).not.toContain('win(s)');
  });

  it('he: no "1 ימים" and the two wins lines use the same word', () => {
    const days = copy.he.Goals.timeElapsed;
    expect(fmt('he', days, { percent: 60, daysRemaining: 1 })).toBe('60% מהזמן חלף (נותר יום אחד)');
    expect(fmt('he', days, { percent: 60, daysRemaining: 2 })).toBe('60% מהזמן חלף (נותרו יומיים)');
    expect(fmt('he', days, { percent: 60, daysRemaining: 30 })).toBe('60% מהזמן חלף (נותרו 30 ימים)');
    const wins = copy.he.WinRules.historyListCapNote;
    expect(fmt('he', wins, { count: 1 })).toBe('מוצג הניצחון האחרון.');
    expect(fmt('he', wins, { count: 5 })).toBe('מוצגים 5 הניצחונות האחרונים.');
    expect(copy.he.WinRules.historyListCapNoteTruncated).not.toContain('זכיות');
  });
});
