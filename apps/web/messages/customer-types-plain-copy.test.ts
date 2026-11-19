import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Customer types page speaks plain words', () => {
  it('avoids pack, composition and baseline jargon in English', () => {
    const f = en.Firmographics;
    for (const key of ['setupInstallTitle', 'setupFeatureCompositionTitle', 'alertsHeading', 'alertsEmpty', 'setupFeatureAlertsTitle', 'setupFeatureAlertsDescription', 'alertsDescription', 'alertBaselineLabel'] as const) {
      expect(f[key], key).not.toMatch(/firmographic|composition|baseline|\$|#/i);
    }
  });
  it('drops the technical Hebrew word for company profiles and baseline', () => {
    const f = he.Firmographics;
    for (const key of ['industryEmpty', 'setupInstallTitle', 'alertsDescription', 'setupFeatureAlertsDescription'] as const) {
      expect(f[key], key).not.toMatch(/פירמוגרפ|קו הבסיס/);
    }
  });
});
