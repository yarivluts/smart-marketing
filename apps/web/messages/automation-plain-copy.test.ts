import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'policyHeading',
  'policySetError',
  'policyProtectedTargetIdsLabel',
  'policyProtectedTargetIdsHint',
  'targetsHeading',
  'targetsEmptyNote',
  'seedTargetIdLabel',
  'seedTargetButton',
  'seedTargetFieldsRequiredError',
  'seedTargetError',
  'proposeNoTargetsNote',
  'proposeDraftNoTargetsNote',
  'connectionNoneOption',
  'killSwitchHeading',
] as const;

const HEBREW = /[֐-׿]/;
const JARGON_EN = /guardrail|\bseed|target|kill switch|ungated/i;
const JARGON_HE = /בקרות|הגדר יעד|יעד|מתג חירום/;

describe('the automation page speaks plain words', () => {
  it('English has no guardrail/seed/target jargon', () => {
    for (const key of KEYS) expect(en.Automation[key], key).not.toMatch(JARGON_EN);
  });

  it('Hebrew is Hebrew and has no jargon', () => {
    for (const key of KEYS) {
      expect(he.Automation[key], key).toMatch(HEBREW);
      expect(he.Automation[key], key).not.toMatch(JARGON_HE);
    }
  });
});
