import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Segments = {
  filterOpLabel: string;
  filterOperators: Record<string, string>;
  eventConditionsLabel: string;
  eventConditionKind: Record<string, string>;
};

const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'];

describe('Customer group filters: plain words', () => {
  for (const [name, m] of [['en', en], ['he', he]] as const) {
    const s = (m as unknown as { Segments: Segments }).Segments;
    it(`${name}: every comparison has a readable label, not a symbol`, () => {
      expect(Object.keys(s.filterOperators).sort()).toEqual([...OPS].sort());
      for (const label of Object.values(s.filterOperators)) {
        expect(label).toMatch(/\p{L}/u);
      }
    });
    it(`${name}: no "operator" or "event" jargon in the labels`, () => {
      const text = [s.filterOpLabel, s.eventConditionsLabel, ...Object.values(s.eventConditionKind)].join(' ');
      expect(text).not.toMatch(/operator|event|אופרטור|אירוע/i);
    });
  }
});
