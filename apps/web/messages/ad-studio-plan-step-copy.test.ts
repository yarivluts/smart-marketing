import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

/** The step is called "Plan" in the stepper; its panel and the autopilot must use the same word. */
describe('Ad Studio plan step uses one plain word', () => {
  const pick = (m: typeof en) => {
    const ad = m.AdStudio as unknown as {
      plan: Record<string, string>;
      autopilot: Record<string, unknown>;
    };
    return {
      plan: ad.plan,
      autopilot: ad.autopilot,
    };
  };

  it('has no "deep analysis" / "deep plan" wording in English', () => {
    const { plan, autopilot } = pick(en);
    const text = JSON.stringify([plan, autopilot]);
    expect(text).not.toMatch(/deep (analysis|plan)/i);
    expect(plan.run).toBe('Write the plan');
    expect(plan.title).toBe('The plan');
  });

  it('has no "deep" wording in Hebrew and keeps the stepper word', () => {
    const { plan, autopilot } = pick(he);
    const text = JSON.stringify([plan, autopilot]);
    expect(text).not.toContain('מעמיק');
    expect(plan.title).toBe('התכנון');
  });
});
