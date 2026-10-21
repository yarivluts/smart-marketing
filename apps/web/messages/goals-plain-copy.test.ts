import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'cockpitTitle',
  'cockpitSubtitle',
  'newGoalModalTitle',
  'newGoalModalSubtitle',
  'kpiOffTrack',
  'filterStatusOffTrack',
  'smartRecDescription',
  'smartRecAction',
  'createDescription',
] as const;

describe('the goals page speaks plain words', () => {
  it('English avoids pace / copilot / reallocation jargon', () => {
    for (const key of KEYS) {
      expect(en.Goals[key], key).not.toMatch(/dynamic|pacing|linear|copilot|reallocat|quantifiable|1-click/i);
    }
  });

  it('Hebrew avoids the dynamic-pace and lag wording', () => {
    for (const key of KEYS) {
      expect(he.Goals[key], key).not.toMatch(/דינמי|בפיגור|מדדי כמותי|תחזיות עמידה/);
    }
  });

  it('labels a late goal the same way in the card count and the filter', () => {
    expect(en.Goals.kpiOffTrack).toBe(en.Goals.filterStatusOffTrack);
    expect(he.Goals.kpiOffTrack).toBe(he.Goals.filterStatusOffTrack);
  });
});
