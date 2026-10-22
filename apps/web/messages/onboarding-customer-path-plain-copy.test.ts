import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['funnelStepHeading', 'funnelStepIntro', 'funnelStepEmpty', 'funnelStepConfirm', 'confirmedFunnelHeading', 'confirmedFunnelIntro', 'confirmedFunnelEdit', 'confirmedFunnelViewConversion'] as const;

describe('the onboarding customer-path step speaks plain words', () => {
  it('English avoids funnel, events, conversion and marketing stage names', () => {
    const o = en.Onboarding;
    for (const k of KEYS) expect(o[k]).not.toMatch(/funnel|events?\b|conversion|recategori|agent/i);
    for (const text of Object.values(o.funnelStage)) expect(text).not.toMatch(/awareness|activation|churn|retention|conversion/i);
  });

  it('Hebrew avoids the funnel and conversion words and stage jargon', () => {
    const o = he.Onboarding;
    for (const k of KEYS) expect(o[k]).not.toMatch(/משפך|המרה|המרות|אירועים|סוכן/);
    for (const text of Object.values(o.funnelStage)) expect(text).not.toMatch(/מודעות|הפעלה|נטישה|שימור|המרה/);
  });
});
