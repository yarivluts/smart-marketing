import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = {
  providerErrors: Record<string, string>;
  clipFailure: Record<string, string>;
  imageFailure: Record<string, string>;
  videoFailure: Record<string, string>;
};

describe('Ad Studio failure reasons say what to do next and avoid model/provider words', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Studio;
    const tryAgain = name === 'en' ? /try again/i : /נסו שוב|נסחו/;
    const jargon = name === 'en' ? /provider|\bmodel\b|given up/i : /ספק|מודל|נכשל/;

    it(`retryable reasons end with a next step (${name})`, () => {
      const retryable = [
        a.clipFailure.refused,
        a.clipFailure.invalid_output,
        a.clipFailure.provider_error,
        a.clipFailure.timed_out,
        a.imageFailure.refused,
        a.imageFailure.invalid_output,
        a.imageFailure.provider_error,
        a.imageFailure.storage_error,
        a.imageFailure.timed_out,
        a.videoFailure.ffmpeg_failed,
        a.videoFailure.storage_error,
        a.videoFailure.timed_out,
      ];
      for (const text of retryable) expect(text).toMatch(tryAgain);
    });

    it(`no model/provider jargon in failure reasons (${name})`, () => {
      const all = [...Object.values(a.clipFailure), ...Object.values(a.imageFailure), ...Object.values(a.videoFailure), a.providerErrors.rate_limited];
      for (const text of all) expect(text).not.toMatch(jargon);
    });
  }
});
