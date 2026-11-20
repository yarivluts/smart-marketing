import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('a project is something you want to grow, not "measure"', () => {
  it('says so in the project, organization and setup screens (en)', () => {
    expect(en.Onboarding.globalNoProjectDescription).toMatch(/want to grow/);
    expect(en.NewOrgPage.nextProjectDescription).toMatch(/want to grow/);
    expect(en.Onboarding.globalDescription).toMatch(/first results/);
    expect(en.Onboarding.globalNoProjectDescription).not.toMatch(/measure/i);
    expect(en.NewOrgPage.nextProjectDescription).not.toMatch(/measure/i);
  });

  it('says the same in Hebrew', () => {
    expect(he.Onboarding.globalNoProjectDescription).toContain('לקדם');
    expect(he.NewOrgPage.nextProjectDescription).toContain('לקדם');
    expect(he.Onboarding.globalDescription).toContain('התוצאות הראשונות');
    expect(he.Onboarding.globalNoProjectDescription).not.toContain('מודדים');
  });
});
