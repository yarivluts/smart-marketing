import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'boardStepHeading',
  'boardStepEmpty',
  'journeyStep_board',
  'journeyBoards',
  'kpiBoards',
  'startHint',
] as const;

describe('setup wizard calls them dashboards, like the menu', () => {
  it('English never says "board" or "report pages"', () => {
    for (const key of KEYS) {
      expect(en.Onboarding[key]).not.toMatch(/\bboards?\b|report pages/i);
      expect(en.Onboarding[key]).toMatch(/dashboard/i);
    }
  });

  it('Hebrew uses the same word as the menu', () => {
    for (const key of KEYS) {
      expect(he.Onboarding[key]).toMatch(/מחוונים/);
    }
  });
});
