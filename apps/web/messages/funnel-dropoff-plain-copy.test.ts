import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['highDropoffAlertHeading', 'dropoffAlertMessage', 'optimizeDropoffButton'] as const;

describe('the customer-path drop-off alert speaks plain words', () => {
  it('English avoids funnel / retargeting / Copilot jargon', () => {
    for (const key of KEYS) {
      expect(en.Funnel[key], key).not.toMatch(/funnel|retarget|copilot|optimi[sz]e/i);
    }
  });

  it('Hebrew avoids the funnel and transliterated retargeting words', () => {
    for (const key of KEYS) {
      expect(he.Funnel[key], key).not.toMatch(/משפך|ריטרגטינג|ייעל/);
    }
  });

  it('keeps the placeholders the screen fills in', () => {
    for (const messages of [en, he]) {
      for (const name of ['{percent}', '{from}', '{to}']) {
        expect(messages.Funnel.dropoffAlertMessage).toContain(name);
      }
    }
  });
});
