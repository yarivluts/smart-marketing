import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'kpiSources',
  'typesDescription',
  'sourcesTitle',
  'sourcesEmpty',
  'lineageTableSub',
  'noMetricsDetail',
  'registerDescription',
] as const;

describe('"Your key numbers" page: plain words instead of warehouse and aggregation', () => {
  it('en: no "warehouse" or "aggregation"', () => {
    for (const key of KEYS) {
      expect(en.MetricRegistry[key], key).not.toMatch(/warehouse|aggregation/i);
    }
  });

  it('he: no "data warehouse" or "aggregation" wording', () => {
    for (const key of KEYS) {
      expect(he.MetricRegistry[key], key).not.toMatch(/מחסן|צבירה|צבירות/);
    }
  });
});
