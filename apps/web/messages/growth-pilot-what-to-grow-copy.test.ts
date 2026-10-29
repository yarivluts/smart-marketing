import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot talks about what to grow, not "targets"', () => {
  it('uses plain words for the start steps, the list and the new-idea button', () => {
    const p = en.GrowthPilot;
    for (const text of [p.start.steps.propose, p.header.newTarget, p.targets.title, p.targets.empty, p.targets.next]) {
      expect(text).not.toMatch(/target/i);
    }
    expect(p.start.steps.propose).toBe('Proposes what to grow');
  });

  it('keeps the Hebrew start step in step with the English one', () => {
    expect(he.GrowthPilot.start.steps.propose).toBe('מציע מה לקדם');
  });
});

describe('Growth Pilot start steps avoid marketing jargon', () => {
  it('says "web pages" instead of "landing pages" and explains the watch step', () => {
    expect(en.GrowthPilot.start.steps.build).toBe('Writes your ads and web pages');
    expect(en.GrowthPilot.start.steps.watch).toBe('Checks the results and suggests fixes');
    expect(en.GrowthPilot.start.steps.build).not.toMatch(/landing/i);
  });

  it('keeps Hebrew in step and free of the jargon "דפי נחיתה"', () => {
    expect(he.GrowthPilot.start.steps.build).toBe('כותב לכם מודעות ודפי אינטרנט');
    expect(he.GrowthPilot.start.steps.watch).toBe('בודק את התוצאות ומציע תיקונים');
  });
});

describe('Growth Pilot list of things to grow reads the same in Hebrew and English', () => {
  it('does not call it "goals" in Hebrew, where goals is a different page', () => {
    const t = he.GrowthPilot.targets;
    expect(t.title).toBe('מה אנחנו מקדמים');
    for (const text of [t.title, t.empty, t.next]) {
      expect(text).not.toContain('יעד');
    }
  });
});
