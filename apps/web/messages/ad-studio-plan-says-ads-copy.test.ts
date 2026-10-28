import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const planCopy = (m: typeof en) => {
  const { plan, audience } = m.AdStudio;
  return [
    plan.description,
    plan.runningHint,
    plan.source.campaigns,
    plan.reasons.campaigns.no_campaigns,
    plan.campaignsRateTitle,
    plan.campaignsRateDescription,
    plan.campaignsTitle,
    plan.campaignsDescription,
    audience.pastDescription,
  ];
};

describe('the Ad Studio plan calls campaigns "ads", like the rest of the app', () => {
  it('English plan and audience copy never says campaign or Meta', () => {
    for (const text of planCopy(en)) expect(text).not.toMatch(/campaign|\bMeta\b/i);
  });

  it('Hebrew plan and audience copy never says קמפיין or מטא', () => {
    for (const text of planCopy(he as typeof en)) expect(text).not.toMatch(/קמפיין|קמפיינים|במטא/);
  });

  it('says what the "by ad" chart counts in plain words', () => {
    expect(en.AdStudio.plan.campaignsRateTitle).toBe('Share of visitors who sign up or buy, by ad');
    expect(he.AdStudio.plan.campaignsRateTitle).toMatch(/לפי מודעה$/);
  });
});
