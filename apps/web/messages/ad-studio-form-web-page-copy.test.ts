import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = {
  fieldLandingPage: string;
  search: { useLandingPage: string };
};
const studio = (m: unknown) => (m as { AdStudio: Studio }).AdStudio;

describe('Ad Studio form fields speak of the web page', () => {
  it('en: no "landing page" in the field label and the keyword toggle', () => {
    for (const t of [studio(en).fieldLandingPage, studio(en).search.useLandingPage]) {
      expect(t).not.toMatch(/landing page/i);
    }
    expect(studio(en).fieldLandingPage).toContain('Web page');
  });
  it('he: same word as the rest of the app', () => {
    for (const t of [studio(he).fieldLandingPage, studio(he).search.useLandingPage]) {
      expect(t).not.toMatch(/דף הנחיתה|דפי נחיתה|דף נחיתה/);
    }
    expect(studio(he).fieldLandingPage).toContain('דף האינטרנט');
  });
});
