import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'metaTitle',
  'cockpitTitle',
  'tabGoals',
  'tabRetention',
  'paybackHeading',
  'paybackDescription',
  'qualityCalibrationHeading',
  'qualityCalibrationDescription',
  'qualityTier',
  'payingRate',
  'avg40dRevenue',
  'paybackDayWindow',
  'flowTitle',
  'conversionChartTitle',
  'conversionSeries',
] as const;

describe('Customer journey & goals page headings use plain words', () => {
  it('has no marketing jargon in the headings and column names (English)', () => {
    for (const key of KEYS) {
      expect(en.FunnelGoals[key], key).not.toMatch(
        /funnel|velocity|calibration|\bintent\b|\btier\b|conv\.|cumulative|\bpace\b|\bretention\b/i,
      );
    }
  });

  it('has no Hebrew jargon (משפך, כיול, דרגת כוונה, שימור) in the same texts', () => {
    for (const key of KEYS) {
      expect(he.FunnelGoals[key], key).not.toMatch(/משפך|כיול|כוונה|שימור|מהירות החזר/);
    }
  });

  it('matches the sidebar name for the page', () => {
    expect(en.FunnelGoals.metaTitle).toBe(en.AppShell.funnelAndGoals);
    expect(he.FunnelGoals.metaTitle).toBe(he.AppShell.funnelAndGoals);
  });

  it('keeps the {days} placeholder in both languages', () => {
    expect(en.FunnelGoals.paybackDayWindow).toContain('{days}');
    expect(he.FunnelGoals.paybackDayWindow).toContain('{days}');
  });
});
