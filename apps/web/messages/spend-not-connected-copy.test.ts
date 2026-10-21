import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('"spend not connected" tells a newcomer what to do', () => {
  it('no longer talks about "this environment" and offers a next step (en)', () => {
    const text = en.Campaigns.spendDegraded.warehouse_not_configured;
    expect(text).not.toMatch(/environment/i);
    expect(text).toMatch(/AI helper/);
  });

  it('does the same in Hebrew', () => {
    const text = he.Campaigns.spendDegraded.warehouse_not_configured;
    expect(text).not.toMatch(/בסביבה/);
    expect(text).toMatch(/עוזר AI/);
  });

  it('the data-limit log says "Done" rather than "Executed"', () => {
    expect(en.CostGuardrails.outcomeExecuted).toBe('Done');
    expect(he.CostGuardrails.outcomeExecuted).toBe('הושלם');
  });
});
