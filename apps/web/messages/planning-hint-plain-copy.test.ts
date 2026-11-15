import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type M = { AdStudio: { planningAdminHint: string } };

describe('planning admin hint avoids the word "warehouse"', () => {
  it('en says connected data', () => {
    const t = (en as unknown as M).AdStudio.planningAdminHint;
    expect(t).not.toMatch(/warehouse/i);
    expect(t).toContain('connected data');
  });
  it('he does not say data warehouse', () => {
    const t = (he as unknown as M).AdStudio.planningAdminHint;
    expect(t).not.toContain('מחסן');
    expect(t.length).toBeGreaterThan(20);
  });
});
