import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('Who comes back page: plain words', () => {
  it('en: no cohort / retention / period jargon in the shown text', () => {
    const m = (en as unknown as Copy).CohortRetention;
    for (const [key, value] of Object.entries(m)) {
      expect(value.replace(/{[^}]*}/g, ''), key).not.toMatch(/cohort|retention|retained|period|conversion/i);
    }
  });

  it('he: no קוהורטה / שימור / תקופה / המרה in the shown text', () => {
    const m = (he as unknown as Copy).CohortRetention;
    for (const [key, value] of Object.entries(m)) {
      expect(value.replace(/{[^}]*}/g, ''), key).not.toMatch(/קוהורט|שימור|תקופ|המרה/);
    }
  });

  it('both languages keep the same keys', () => {
    expect(Object.keys((he as unknown as Copy).CohortRetention).sort()).toEqual(
      Object.keys((en as unknown as Copy).CohortRetention).sort(),
    );
  });
});
