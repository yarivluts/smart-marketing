import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// A newcomer has no "warehouse". Customer-feedback, cancellations, campaign, member and
// AI-helper texts say "your data" instead.
const dump = (messages: unknown) => JSON.stringify(messages);
const PLAIN = [
  'from your connected data',
  "Once your ad spend is connected",
  "your data isn't connected yet)",
  'Daily spend measured for this campaign.',
  'no collected revenue has reached this project',
  'give it a little while to bring in your numbers',
];
const PLAIN_HE = ['מהנתונים המחוברים שלכם', 'הנתונים שלכם עדיין לא מחוברים', 'שהמספרים שלכם ייכנסו'];

describe('plain wording instead of "warehouse"', () => {
  it.each([
    'data warehouse',
    'reaches the warehouse',
    'reached the warehouse',
    'lands in the warehouse',
    'the warehouse measured',
    'warehouse not configured yet',
    'let the warehouse refresh',
  ])('en: no "%s"', (phrase) => {
    expect(dump(en)).not.toContain(phrase);
  });

  it('he: no "מחסן הנתונים" in the touched sentences', () => {
    const text = dump(he);
    expect(text).not.toContain('לפי ערך, ממחסן הנתונים.');
    expect(text).not.toContain('מחסן הנתונים טרם הוגדר');
    expect(text).not.toContain('שמחסן הנתונים מדד');
    expect(text).not.toContain('המתן לרענון המחסן');
  });

  it('en and he carry the plain replacements', () => {
    for (const p of PLAIN) expect(dump(en)).toContain(p);
    for (const p of PLAIN_HE) expect(dump(he)).toContain(p);
  });
});
