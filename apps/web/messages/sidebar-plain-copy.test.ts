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

describe('sidebar links for customer groups and visitor recordings use plain words', () => {
  it('English avoids "segments" and "session replay"', () => {
    expect(en.OrgDetailPage.projectSegmentsLink).toBe('Customer groups');
    expect(en.OrgDetailPage.projectSessionReplayLink).toBe('Visitor recordings');
  });

  it('Hebrew avoids the transliterated "session" and the statistical "slices"', () => {
    const { projectSegmentsLink, projectSessionReplayLink } = he.OrgDetailPage;
    expect(projectSegmentsLink).not.toContain('פלח');
    expect(projectSessionReplayLink).not.toContain('סשן');
    expect(projectSegmentsLink).toMatch(/[֐-׿]/);
    expect(projectSessionReplayLink).toMatch(/[֐-׿]/);
  });
});
