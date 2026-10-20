import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('A/B tests and alerts pages: plain names', () => {
  it.each([
    ['en', en],
    ['he', he],
  ] as const)('%s: sidebar link and page title match', (_l, messages) => {
    const m = messages as unknown as Copy;
    expect(m.Experiments.metaTitle).toBe(m.OrgDetailPage.projectExperimentsLink);
    expect(m.Experiments.title).toContain(m.OrgDetailPage.projectExperimentsLink);
    expect(m.Insights.metaTitle).toBe(m.OrgDetailPage.projectInsightsLink);
    expect(m.Insights.title).toContain(m.OrgDetailPage.projectInsightsLink);
  });

  it('en names say what the page holds, not a bare noun', () => {
    const m = en as unknown as Copy;
    expect(m.OrgDetailPage.projectExperimentsLink).toBe('A/B tests');
    expect(m.OrgDetailPage.projectInsightsLink).toBe('Alerts and wins');
  });
});
