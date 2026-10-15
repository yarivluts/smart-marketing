import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const p = { en: en.GrowthPilot, he: he.GrowthPilot };

describe('Growth Pilot says "switched off", not "paused", for ads that are not running yet', () => {
  it('activity log and results screen use the same plain words as the cards (en)', () => {
    expect(p.en.activity.kind.ads_published).toContain('switched-off');
    expect(p.en.performance.noDelivery).toContain('switched-off');
    for (const text of [p.en.activity.kind.ads_published, p.en.performance.noDelivery]) {
      expect(text).not.toMatch(/paused/i);
    }
  });

  it('keeps the Hebrew in step', () => {
    for (const text of [p.he.activity.kind.ads_published, p.he.performance.noDelivery]) {
      expect(text).toContain('כבוי');
      expect(text).not.toContain('מושה');
    }
  });
});
