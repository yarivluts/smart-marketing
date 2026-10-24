import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('NPS and cancellation pages: sign-up month, not cohort', () => {
  for (const ns of ['Feedback', 'ChurnReasons']) {
    it(`en ${ns}: no cohort jargon`, () => {
      const m = (en as unknown as Copy)[ns];
      for (const key of ['description', 'byCohortHeading', 'byCohortEmpty']) {
        expect(m[key], key).not.toMatch(/cohort/i);
      }
      expect(m.byCohortHeading).toBe('By sign-up month');
    });

    it(`he ${ns}: no קוהורט`, () => {
      const m = (he as unknown as Copy)[ns];
      for (const key of ['description', 'byCohortHeading', 'byCohortEmpty']) {
        expect(m[key], key).not.toMatch(/קוהורט/);
      }
    });
  }
});
