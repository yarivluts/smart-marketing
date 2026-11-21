import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the add-an-ad errors name the fields the person sees', () => {
  it('the required-fields error uses the field label, not "environment"', () => {
    expect(en.Automation.seedTargetFieldsRequiredError).toContain(en.Automation.seedTargetEnvironmentLabel);
    expect(en.Automation.seedTargetFieldsRequiredError).not.toMatch(/environment/i);
    expect(he.Automation.seedTargetFieldsRequiredError).toContain(he.Automation.seedTargetEnvironmentLabel);
    expect(he.Automation.seedTargetFieldsRequiredError).not.toContain('סביבה');
  });

  it('the budget error says what to enter instead of "non-negative"', () => {
    expect(en.Automation.seedTargetInvalidBudgetError).not.toMatch(/non-negative/i);
    expect(he.Automation.seedTargetInvalidBudgetError).not.toContain('שלילי');
  });
});
