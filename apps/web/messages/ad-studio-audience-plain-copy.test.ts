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

  it('speaks of groups of people instead of audiences, presets and segments', () => {
    const a = en.AdStudio.audience;
    for (const text of [a.title, a.audiencesTitle, a.kinds.saved, a.pastDescription, a.columns.segment]) {
      expect(text).not.toMatch(/\b(audiences?|presets?|segments?|conversions?)\b/i);
    }
    expect(a.title).toBe('Who sees the ad (Facebook & Instagram)');
  });

  it('addresses everyone in the plural in Hebrew', () => {
    const a = he.AdStudio.audience;
    for (const text of [a.noAudiences, a.kinds.custom, a.kinds.lookalike, a.kindsHint, a.columns.linkClicks]) {
      expect(text).not.toMatch(/שלך|לך\b/);
    }
    expect(a.columns.segment).toBe('קבוצת אנשים');
  });
});
