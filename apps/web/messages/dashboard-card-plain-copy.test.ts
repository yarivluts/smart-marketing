import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

const KEYS = [
  'cardNoVertical',
  'cardStreams',
  'cardRequirementsLabel',
  'cardLastIngest',
  'cardStatus_ok',
  'kpiFlowing',
  'kpiFlowingSubtext',
  'cardHealthRestricted',
] as const;

describe('dashboard project card wording', () => {
  it.each([
    ['en', en, /stream|ingest|vertical|flowing/i],
    ['he', he, /זרם|זרמ|קליטה|תחום/],
  ] as const)('%s: speaks of data sources, not streams or ingest', (_l, messages, jargon) => {
    const page = (messages as unknown as Copy).DashboardPage;
    for (const key of KEYS) {
      expect(page[key], key).toBeTruthy();
      expect(page[key], key).not.toMatch(jargon);
    }
  });
});
