import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('creating an organization without a name', () => {
  it('tells a newcomer what to type, in both languages', () => {
    expect(en.NewOrgPage.nameRequired).toMatch(/name/i);
    expect(he.NewOrgPage.nameRequired).toBeTruthy();
    expect(he.NewOrgPage.nameRequired).not.toBe(en.NewOrgPage.nameRequired);
  });

  it('does not blame the system for a missing name', () => {
    expect(en.NewOrgPage.nameRequired).not.toMatch(/could not|error|failed/i);
  });
});
