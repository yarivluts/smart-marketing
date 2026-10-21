import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const JARGON = /warehouse|funnel|estimate|backed|quer(y|ied)/i;
const HE_JARGON = /מחסן|משפך|הערכה|מגובה|שלוף/;

type Bag = Record<string, Record<string, Record<string, string>>>;
const pick = (m: Bag): string[] => [
  ...Object.values(m.Boards?.tileUnavailableReason ?? {}),
  ...Object.values(m.Goals?.thermometerUnavailableReason ?? {}),
  ...Object.values(m.FunnelGoals?.funnelUnavailable ?? {}),
  ...Object.values(m.FunnelGoals?.sectionUnavailable ?? {}),
];

describe('boards, goals and customer-path "not shown" reasons use plain words', () => {
  it('reads the reasons from the namespaces this test expects', () => {
    for (const m of [en, he] as unknown as Bag[]) expect(pick(m).length).toBeGreaterThan(10);
  });
  it('en has no jargon', () => {
    for (const s of pick(en as unknown as Bag)) expect(s).not.toMatch(JARGON);
  });
  it('he has no jargon', () => {
    for (const s of pick(he as unknown as Bag)) expect(s).not.toMatch(HE_JARGON);
  });
});
