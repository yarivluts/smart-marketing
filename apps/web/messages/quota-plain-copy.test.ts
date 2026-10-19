import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Daily data limit copy', () => {
  const pick = (m: typeof en | typeof he) => [
    m.Boards.tileUnavailableReason.quota_exceeded,
    m.Goals.thermometerUnavailableReason.quota_exceeded,
    m.FunnelGoals.funnelUnavailable.quota_exceeded,
    m.FunnelGoals.sectionUnavailable.quota_exceeded,
  ];

  it('says "too many data requests today" instead of "query quota"', () => {
    for (const text of pick(en)) {
      expect(text).toMatch(/too many data requests today/i);
      expect(text).not.toMatch(/quota|quer(y|ies)/i);
    }
  });

  it('says it in Hebrew without "שאילתות" or "מכסה"', () => {
    for (const text of pick(he)) {
      expect(text).toContain('יותר מדי בקשות נתונים היום');
      expect(text).not.toMatch(/שאילתות|מכס/);
    }
  });
});
