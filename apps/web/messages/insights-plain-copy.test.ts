import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;
const keys = ['description', 'empty', 'trackingAlertDetail', 'metricHealthTitle'];

describe('Insights page: plain words for a newcomer', () => {
  it('en: no "queried", "queryable", "records landed" or "registered metric"', () => {
    const m = (en as unknown as Copy).Insights;
    for (const key of keys) {
      expect(m[key], key).not.toMatch(/quer(y|ied)|landed|registered|as defined/i);
    }
  });

  it('he: no "לתשאל" (to query) or "רשומות" (records)', () => {
    const m = (he as unknown as Copy).Insights;
    for (const key of keys) {
      expect(m[key], key).not.toMatch(/תשאל|רשומות/);
    }
  });

  it('keeps every placeholder', () => {
    for (const l of [en, he] as unknown as Copy[]) {
      expect(l.Insights.trackingAlertDetail).toMatch(/\{schemaName\}.*\{lastSeenAt\}|\{lastSeenAt\}.*\{schemaName\}/);
      expect(l.Insights.metricHealthTitle).toMatch(/\{metricName\}/);
      expect(l.Insights.metricHealthTitle).toMatch(/\{version\}/);
    }
  });
});
