import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the three main sidebar modules use words a beginner knows', () => {
  it('English names avoid funnel / copilot / performance jargon', () => {
    const { adsAndPerformance, funnelAndGoals, aiCopilotAndAutomation } = en.AppShell;
    expect(adsAndPerformance).toBe('Ads & results');
    expect(funnelAndGoals).not.toMatch(/funnel/i);
    expect(aiCopilotAndAutomation).not.toMatch(/copilot/i);
  });

  it('Hebrew names avoid the funnel metaphor and stay in Hebrew', () => {
    const { adsAndPerformance, funnelAndGoals, aiCopilotAndAutomation } = he.AppShell;
    expect(funnelAndGoals).not.toMatch(/\u05DE\u05E9\u05E4\u05DA/);
    expect(adsAndPerformance).not.toMatch(/\u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD/);
    for (const label of [adsAndPerformance, funnelAndGoals, aiCopilotAndAutomation]) {
      expect(label).toMatch(/[֐-׿]/);
    }
  });
});
