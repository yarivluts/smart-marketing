import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the Ad Studio plan sections use plain words', () => {
  const sections = ['en', 'he'].map((l) => (l === 'en' ? en : he).AdStudio.planSections);

  it('no section title is a bare brand or jargon label', () => {
    expect(en.AdStudio.planSections.audience).not.toMatch(/^Audience \(Meta\)$/);
    expect(en.AdStudio.planSections.keywords).not.toMatch(/^Search keywords$/);
    expect(en.AdStudio.planSections.references).not.toMatch(/reference/i);
    expect(he.AdStudio.planSections.audience).not.toMatch(/^קהל/);
    expect(he.AdStudio.planSections.references).not.toMatch(/רפרנס/);
  });

  it('each title says what the section is for, in both languages', () => {
    expect(en.AdStudio.planSections.audience).toMatch(/who sees/i);
    expect(en.AdStudio.planSections.keywords).toMatch(/people search for/i);
    expect(he.AdStudio.planSections.audience).toMatch(/מי יראו/);
    expect(he.AdStudio.planSections.keywords).toMatch(/מה אנשים מחפשים/);
  });

  it('en and he define the same keys', () => {
    expect(Object.keys(sections[0]).sort()).toEqual(Object.keys(sections[1]).sort());
  });
});
