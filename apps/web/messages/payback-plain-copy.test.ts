import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'paybackHeading',
  'paybackDescription',
  'qualityCalibrationHeading',
  'qualityCalibrationDescription',
  'qualityTier',
  'payingRate',
  'avg40dRevenue',
  'paybackDayWindow',
] as const;

describe('the payback and sign-up quality section on Funnel & Goals speaks plain words', () => {
  it('English avoids calibration, tier, velocity and conversion jargon', () => {
    for (const key of KEYS) {
      expect(en.FunnelGoals[key], key).not.toMatch(/calibration|tier|velocity|conv\.|conversion|cumulative|intent/i);
    }
  });

  it('Hebrew avoids calibration, intent-rank and conversion jargon', () => {
    for (const key of KEYS) {
      expect(he.FunnelGoals[key], key).not.toMatch(/כיול|דירוג|דרגת|המרה|מצטבר/);
    }
  });

  it('keeps the day placeholder in the window label', () => {
    expect(en.FunnelGoals.paybackDayWindow).toContain('{days}');
    expect(he.FunnelGoals.paybackDayWindow).toContain('{days}');
  });
});
