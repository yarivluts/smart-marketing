import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Facebook connection "not available" message is in plain words', () => {
  it('en: no setting names, and says retrying will not help', () => {
    const text = en.MetaConnect.errors.not_configured;
    expect(text).not.toMatch(/META_|deployment|configured/i);
    expect(text).toMatch(/GrowthOS support/);
  });

  it('he: no setting names, and points to support', () => {
    const text = he.MetaConnect.errors.not_configured;
    expect(text).not.toMatch(/META_|בסביבה|הוגדר/);
    expect(text).toMatch(/תמיכה/);
  });
});
