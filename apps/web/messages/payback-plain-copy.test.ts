import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const ops = { en: en.CampaignOps, he: he.CampaignOps } as unknown as Record<'en' | 'he', Record<string, string>>;
const plugins = { en: en.ProjectPlugins, he: he.ProjectPlugins } as unknown as Record<'en' | 'he', Record<string, string>>;

describe('Ad payback and report-pack copy uses plain words', () => {
  it('avoids calibration, campaign x channel and conversion-rate jargon', () => {
    for (const l of ['en', 'he'] as const) {
      for (const t of [ops[l].description, ops[l].calibrationHeading, ops[l].calibrationDescription, plugins[l].builtinPackLandingPageDescription]) {
        expect(t).not.toMatch(/calibrat|conversion rate|fixed-window|per-campaign|\sx\s|כיול|אחוז המרה|קמפיין|ערוץ|חלון זמן/i);
      }
    }
  });

  it('keeps the 40-day window in the explanation', () => {
    expect(ops.en.calibrationDescription).toContain('40 days');
    expect(ops.he.calibrationDescription).toContain('40');
  });
});
