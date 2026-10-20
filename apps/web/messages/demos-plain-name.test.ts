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

describe('demos page Hebrew copy', () => {
  const he_ = (he as unknown as Copy).Demos;
  it('addresses everyone in the plural, not "you (m/f)" slashes', () => {
    const text = Object.values(he_).join(' ');
    expect(text).not.toMatch(/\p{L}\/\p{L}/u);
  });

  it('uses one word for a demo call instead of slang and jargon', () => {
    const text = Object.values(he_).join(' ');
    expect(text).not.toMatch(/דמואים|צנרת|צינור/);
  });
});
