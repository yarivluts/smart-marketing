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

describe('dashboard project card with no data yet', () => {
  it.each([
    ['en', en, /you do not need any/, /Growth Pilot/],
    ['he', he, /אין צורך בנתונים/, /\u05d8\u05d9\u05d9\u05e1 \u05e6\u05de\u05d9\u05d7\u05d4/],
  ] as const)('%s: reassures a newcomer and points to Growth Pilot', (_l, messages, need, pilot) => {
    const text = (messages as unknown as Copy).DashboardPage.cardNoRecentData;
    expect(text).toMatch(need);
    expect(text).toMatch(pilot);
  });
});
