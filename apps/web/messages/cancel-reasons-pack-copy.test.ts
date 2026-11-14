import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const ids = (o: Record<string, unknown>) => o as Record<string, Record<string, string>>;

describe('cancellation-reasons pack names', () => {
  it('English uses plain words, not "churn"', () => {
    const e = ids(en);
    expect(e.ProjectPlugins.builtinPackChurnReasonTitle).toBe('Why customers cancel');
    for (const text of [
      e.ProjectPlugins.builtinPackChurnReasonTitle,
      e.ChurnReasons.setupIntro,
      e.ChurnReasons.setupInstallTitle,
    ]) {
      expect(text).not.toMatch(/churn/i);
    }
  });

  it('Hebrew uses one name (cancel, not churn) in the list and setup text', () => {
    const h = ids(he);
    for (const text of [
      h.ProjectPlugins.builtinPackChurnReasonTitle,
      h.ChurnReasons.setupIntro,
      h.ChurnReasons.setupInstallTitle,
    ]) {
      expect(text).not.toContain('נטישה');
      expect(text).toContain('ביטול');
    }
  });
});
