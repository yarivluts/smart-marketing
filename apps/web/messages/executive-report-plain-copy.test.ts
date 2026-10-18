import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const HEBREW = /[֐-׿]/;
const JARGON = /\b(CAC|ROAS|dunning)\b|דאנינג/i;

describe('Executive report and funnel cockpit describe payments and costs in plain words', () => {
  it('English description and recovery label avoid CAC, ROAS and dunning', () => {
    expect(en.ExecutiveReport.description).not.toMatch(JARGON);
    expect(en.FunnelGoals.kpiDunningRecovery).not.toMatch(JARGON);
  });

  it('Hebrew copy is Hebrew and avoids the same jargon', () => {
    expect(he.ExecutiveReport.description).toMatch(HEBREW);
    expect(he.ExecutiveReport.description).not.toMatch(JARGON);
    expect(he.FunnelGoals.kpiDunningRecovery).toMatch(HEBREW);
    expect(he.FunnelGoals.kpiDunningRecovery).not.toMatch(JARGON);
  });
});
