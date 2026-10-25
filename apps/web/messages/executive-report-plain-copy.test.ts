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

describe('Executive report headings speak to a beginner', () => {
  const HEADINGS = [
    'title',
    'subtitle',
    'liveBadge',
    'channelAllocationHeading',
    'spendAllocationHeading',
    'periodComparisonHeading',
    'metricBlendedCac',
    'metricBlendedRoas',
    'metaShare',
    'googleShare',
  ] as const;
  const HEADING_JARGON = /\b(CAC|ROAS|blended|pipeline|cross-channel|executive|meta ads)\b|\(CAC\)|\(ROAS\)|רב-ערוצית|צינור|מנהלים/i;

  it.each(HEADINGS)('%s avoids acronyms and corporate words in en and he', (key) => {
    expect(en.ExecutiveReport[key]).not.toMatch(HEADING_JARGON);
    expect(he.ExecutiveReport[key]).not.toMatch(HEADING_JARGON);
    expect(he.ExecutiveReport[key]).toMatch(HEBREW);
  });
});
