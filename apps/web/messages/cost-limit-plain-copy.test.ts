import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const HEBREW = /[֐-׿]/;
const JARGON_EN = /quota|quer(y|ies)|attempt|warehouse|BigQuery|executor|bytes|key=value|guardrail/i;
const JARGON_HE = /מכסה|שאילת|מחסן|BigQuery|key=value|בקרות/;

const words = (value: string) => value.replace(/\{[^}]*\}/g, '');

const keys = Object.keys(en.CostGuardrails) as (keyof typeof en.CostGuardrails)[];

describe('the data usage limit page speaks plain words', () => {
  it('English has no technical jargon, and the sidebar matches the page title', () => {
    for (const key of keys) expect(words(en.CostGuardrails[key]), key).not.toMatch(JARGON_EN);
    expect(en.OrgDetailPage.projectCostGuardrailsLink).toBe(en.CostGuardrails.metaTitle);
    expect(en.CostGuardrails.title).toContain('{projectName}');
  });

  it('Hebrew is Hebrew, has no technical jargon, and the sidebar matches the page title', () => {
    for (const key of keys) {
      const value = (he.CostGuardrails as Record<string, string>)[key];
      if (value === undefined || !/[a-z]/i.test(words(en.CostGuardrails[key])) || key === 'labelsPlaceholder') continue;
      expect(value, key).toMatch(HEBREW);
      expect(words(value), key).not.toMatch(JARGON_HE);
    }
    expect(he.OrgDetailPage.projectCostGuardrailsLink).toBe(he.CostGuardrails.metaTitle);
    expect(he.CostGuardrails.title).toContain('{projectName}');
  });
});
