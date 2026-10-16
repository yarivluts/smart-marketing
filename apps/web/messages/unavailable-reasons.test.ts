import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const REASONS = ['warehouse_not_configured', 'quota_exceeded', 'not_yet_backed', 'query_error'] as const;
const JARGON = /warehouse|quota|quer(y|ies)|backed/i;

describe('board and goal "unavailable" reasons', () => {
  for (const [name, messages] of [['en', en], ['he', he]] as const) {
    it(`${name}: every reason is plain words a newcomer can act on`, () => {
      for (const group of [messages.Boards.tileUnavailableReason, messages.Goals.thermometerUnavailableReason]) {
        for (const reason of REASONS) {
          const text = (group as Record<string, string>)[reason];
          expect(text, reason).toBeTruthy();
          expect(text).not.toMatch(JARGON);
        }
      }
    });
  }
});
