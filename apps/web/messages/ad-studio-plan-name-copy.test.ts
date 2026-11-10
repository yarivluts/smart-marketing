import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = {
  autopilot: {
    description: string;
    optionPlan: string;
    step: { plan: string };
    prepareDescription: string;
  };
};

describe('Ad Studio calls the first step simply "the plan", not a "deep plan"', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = (lang.AdStudio as unknown as { autopilot: Studio['autopilot'] }).autopilot;
    const deep = name === 'en' ? /deep/i : /מעמיק/;

    it(`has no "deep" qualifier in the plan labels (${name})`, () => {
      for (const text of [a.description, a.optionPlan, a.step.plan, a.prepareDescription]) {
        expect(text).toBeTruthy();
        expect(text).not.toMatch(deep);
      }
    });
  }

  it('reads plainly in English', () => {
    expect((en.AdStudio as unknown as Studio).autopilot.optionPlan).toBe('Plan first');
    expect((en.AdStudio as unknown as Studio).autopilot.step.plan).toBe('Plan');
  });
});
