import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const HEBREW = /[֐-׿]/;

describe('the Churn reasons and Win rules pages are named in words a beginner knows', () => {
  it('English sidebar link and page title agree and avoid "churn" / "rules"', () => {
    expect(en.OrgDetailPage.projectChurnReasonsLink).toBe(en.ChurnReasons.metaTitle);
    expect(en.ChurnReasons.title).toContain(en.ChurnReasons.metaTitle);
    expect(en.ChurnReasons.metaTitle).not.toMatch(/churn/i);
    expect(en.WinRules.title).toContain(en.WinRules.metaTitle);
    expect(en.WinRules.metaTitle).not.toMatch(/rules/i);
    expect(en.WinRules.rulesHeading).not.toMatch(/rules/i);
  });

  it('Hebrew names are Hebrew, keep the project name placeholder and drop the old wording', () => {
    expect(he.OrgDetailPage.projectChurnReasonsLink).toBe(he.ChurnReasons.metaTitle);
    for (const text of [he.ChurnReasons.metaTitle, he.ChurnReasons.title, he.WinRules.metaTitle, he.WinRules.title, he.WinRules.rulesHeading]) {
      expect(text).toMatch(HEBREW);
      expect(text).not.toMatch(/נטישה|כללי/);
    }
    expect(he.ChurnReasons.title).toContain('{projectName}');
    expect(he.WinRules.title).toContain('{projectName}');
    expect(he.WinRules.title).toContain(he.WinRules.metaTitle);
  });
});
