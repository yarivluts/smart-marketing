import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = {
  providerErrors: Record<string, string>;
  clipFailure: Record<string, string>;
  imageFailure: Record<string, string>;
  autopilot: { reason: Record<string, string> };
};

describe('Ad Studio AI-service failures are explained without "provider" / "model" jargon', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Studio;
    const jargon = name === 'en' ? /provider|\bmodel\b|failed/i : /ספק|מודל|נכשל/;

    it(`provider_error messages avoid jargon (${name})`, () => {
      for (const text of [
        a.providerErrors.provider_error,
        a.clipFailure.provider_error,
        a.imageFailure.provider_error,
        a.autopilot.reason.provider_error,
      ]) {
        expect(text).toBeTruthy();
        expect(text).not.toMatch(jargon);
      }
    });

    it(`the main message says what to do next (${name})`, () => {
      expect(a.providerErrors.provider_error).toMatch(name === 'en' ? /try again/i : /נסו שוב/);
    });
  }
});
