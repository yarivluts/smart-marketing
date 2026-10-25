import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Segments daily-limit copy', () => {
  for (const [name, bundle] of [['en', en], ['he', he]] as const) {
    it(`${name}: says what happened and what to do, without query/quota jargon`, () => {
      for (const text of [bundle.Segments.memberCountQuotaExceeded, bundle.Segments.membersQuotaExceeded]) {
        expect(text).not.toMatch(/quota|quer|שאילתות/i);
        expect(text).toMatch(/tomorrow|מחר/);
      }
    });
  }

  it('Hebrew addresses everyone in the plural', () => {
    expect(he.Segments.memberCountQuotaExceeded).toContain('נסו');
    expect(he.Segments.membersQuotaExceeded).toContain('נסו');
  });
});
