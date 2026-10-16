import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const JARGON = /warehouse|quota|query|metric pack|pipeline|cohort|funnel/i;
const HE_JARGON = /מחסן|מכסת|שאילתות|חבילת המדדים|צינור|שימור קבוצות|משפך/;

type Bag = Record<string, Record<string, unknown>>;
const pick = (m: Bag) => [
  ...['Customers', 'CohortRetention', 'Funnel'].flatMap((ns) => {
    const bag = m[ns] ?? {};
    return ['notConfigured', 'quotaExceeded', 'queryError'].map((k) => bag[k]);
  }),
  ...Object.values((m.TrialPipeline?.unavailable ?? {}) as Record<string, string>),
];

describe('customer pages say "can\'t show this" in plain words', () => {
  it('has the namespaces under the names this test reads', () => {
    for (const m of [en, he] as unknown as Bag[]) {
      expect(m.TrialPipeline).toBeDefined();
    }
  });
  it('en has no jargon', () => {
    for (const s of pick(en as unknown as Bag).filter(Boolean)) expect(s).not.toMatch(JARGON);
  });
  it('he has no jargon', () => {
    for (const s of pick(he as unknown as Bag).filter(Boolean)) expect(s).not.toMatch(HE_JARGON);
  });
});
