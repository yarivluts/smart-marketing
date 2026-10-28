import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const copy = (m: typeof en) => {
  const attribution = m.SetupHealth.requirements.landing_page_attribution;
  return [attribution.title, attribution.impact, m.Onboarding.packLandingPageDescription];
};

describe('setup health and the onboarding page pack call campaigns "ads"', () => {
  it('English copy never says campaign', () => {
    for (const text of copy(en)) expect(text).not.toMatch(/campaign/i);
  });

  it('Hebrew copy never says קמפיין', () => {
    for (const text of copy(he as typeof en)) expect(text).not.toMatch(/קמפיין/);
  });
});
