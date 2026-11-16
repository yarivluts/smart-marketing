import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';
import { filterOperatorKey } from '../lib/orgs/filter-operator-key';

type Section = Record<string, unknown>;
const ops = ['=', '!=', '>', '>=', '<', '<=', 'in'];

describe('Filter forms: comparison in plain words', () => {
  for (const [lang, m] of [['en', en], ['he', he]] as const) {
    for (const ns of ['MetricRegistry', 'Boards', 'WinRules']) {
      it(`${lang} ${ns}: every comparison has a word and the label is not "Operator"`, () => {
        const sec = (m as unknown as Record<string, Section>)[ns];
        const words = sec.filterOperators as Record<string, string>;
        for (const op of ops) {
          const key = filterOperatorKey(op).replace('filterOperators.', '');
          expect(words[key]).toBeTruthy();
          expect(words[key]).not.toMatch(/^[=!<>]+$/);
        }
        expect(String(sec.filterOperatorLabel)).not.toMatch(/operator|אופרטור/i);
      });
    }
  }
});
