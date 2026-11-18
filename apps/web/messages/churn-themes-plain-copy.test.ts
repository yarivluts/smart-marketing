import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['themeDigestNoneMatched', 'themeDigestCoverage'] as const;
type Ns = Record<string, string>;
const enNs = (en as unknown as { ChurnReasons: Ns }).ChurnReasons;
const heNs = (he as unknown as { ChurnReasons: Ns }).ChurnReasons;

describe('churn reasons theme notes use plain words', () => {
  it.each(KEYS)('%s exists in en and he', (key) => {
    expect(enNs[key]).toBeTruthy();
    expect(heNs[key]).toBeTruthy();
  });

  it('does not use the word taxonomy or "keyword" jargon', () => {
    for (const key of KEYS) {
      expect(enNs[key]).not.toMatch(/taxonomy|keyword/i);
      expect(heNs[key]).not.toContain('טקסונומי');
    }
  });

  it('keeps the counts and says what to do about other languages', () => {
    expect(enNs.themeDigestCoverage).toContain('{matched}');
    expect(enNs.themeDigestCoverage).toContain('{total}');
    expect(heNs.themeDigestCoverage).toContain('{matched}');
    expect(enNs.themeDigestNoneMatched).toMatch(/another language/);
  });
});
