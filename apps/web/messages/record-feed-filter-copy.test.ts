import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['filterActiveNote', 'filterEmpty'] as const;

describe('Latest records filter notes', () => {
  for (const [name, messages] of [['en', en], ['he', he]] as const) {
    describe(name, () => {
      for (const key of KEYS) {
        const text = messages.RecordFeed[key];

        it(`${key} keeps the window number and avoids the word "schema"`, () => {
          expect(text).toContain('{window}');
          expect(text.toLowerCase()).not.toContain('schema');
        });
      }

      it('filterActiveNote still names the field and the value', () => {
        expect(messages.RecordFeed.filterActiveNote).toContain('{field}');
        expect(messages.RecordFeed.filterActiveNote).toContain('{value}');
      });
    });
  }
});
