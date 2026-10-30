import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type M = {
  SetupHealth: { requirements: { landing_page_attribution: { impact: string } } };
  AdStudio: { planningAdminHint: string };
};
const texts = (m: unknown) => {
  const x = m as M;
  return [x.SetupHealth.requirements.landing_page_attribution.impact, x.AdStudio.planningAdminHint];
};

describe('setup health and deep-analysis hint speak of the web page', () => {
  it('en says web page, not landing page', () => {
    for (const t of texts(en)) {
      expect(t).not.toMatch(/landing page/i);
      expect(t).toContain('web page');
    }
  });
  it('he uses the same word as the rest of the app', () => {
    for (const t of texts(he)) {
      expect(t).not.toContain('דף הנחיתה');
      expect(t).not.toContain('דפי הנחיתה');
      expect(t).toContain('דף האינטרנט'.slice(0, 3));
    }
  });
});
