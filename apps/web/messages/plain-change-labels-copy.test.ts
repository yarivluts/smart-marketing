import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('change summaries use plain labels', () => {
  it('English says "Change", not the developer word "Diff"', () => {
    expect(en.Automation.diffLabel).toBe('Change');
  });

  it('English names the targeting row by what it means', () => {
    expect(en.Automation.diffFieldTargeting).toBe('Who sees the ads');
  });

  it('Hebrew targeting row says who sees the ads and keeps the change label', () => {
    expect((he as typeof en).Automation.diffFieldTargeting).toContain('מי רואה');
    expect((he as typeof en).Automation.diffLabel.length).toBeGreaterThan(0);
  });
});
