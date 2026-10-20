import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('demos page name', () => {
  it.each([
    ['en', en],
    ['he', he],
  ] as const)('%s: sidebar link and page title say what the page is', (_l, messages) => {
    const m = messages as unknown as Copy;
    expect(m.OrgDetailPage.projectDemosLink).toBeTruthy();
    expect(m.Demos.metaTitle).toBe(m.OrgDetailPage.projectDemosLink);
    expect(m.Demos.title).toContain(m.OrgDetailPage.projectDemosLink);
  });

  it('en setup intro avoids "lifecycle events"', () => {
    expect((en as unknown as Copy).Demos.setupIntro).not.toMatch(/lifecycle|events/i);
  });
});
