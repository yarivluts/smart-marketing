import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Customer journey page cancellation-rate note', () => {
  it('says "canceled" instead of the word churn (English)', () => {
    expect(en.FunnelGoals.kpiChurnRate).not.toMatch(/churn/i);
    expect(en.FunnelGoals.kpiChurnRate).toMatch(/canceled/);
    expect(en.FunnelGoals.kpiChurnRate).toContain('{rate}');
  });

  it('says customers canceled instead of the word נטישה (Hebrew)', () => {
    expect(he.FunnelGoals.kpiChurnRate).not.toMatch(/נטישה/);
    expect(he.FunnelGoals.kpiChurnRate).toContain('{rate}');
  });
});
