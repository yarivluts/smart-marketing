import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = {
  providerNotConfigured: string;
  providerErrors: { not_configured: string };
  plan: { noProvider: string };
};

describe('Ad Studio says the AI is not switched on, with a next step, not "provider" / "deployment"', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Studio;
    const jargon = name === 'en' ? /provider|deployment|configured/i : /ספק|סביבה|הוגדר/;
    const support = /GrowthOS/;

    it(`names the next step and avoids jargon (${name})`, () => {
      for (const text of [a.providerNotConfigured, a.providerErrors.not_configured, a.plan.noProvider]) {
        expect(text).toBeTruthy();
        expect(text).not.toMatch(jargon);
        expect(text).toMatch(support);
      }
    });
  }
});
