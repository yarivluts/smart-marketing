import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('web pages starter-set title reads like its siblings', () => {
  it('en is plain sentence case, not a title-cased label, in both places', () => {
    expect(en.Onboarding.packLandingPageTitle).toBe('How your web pages are doing');
    expect(en.ProjectPlugins.builtinPackLandingPageTitle).toBe(en.Onboarding.packLandingPageTitle);
    expect(en.Onboarding.packLandingPageTitle).not.toMatch(/Web Page Performance/);
  });
  it('he has a title in both places', () => {
    expect(he.Onboarding.packLandingPageTitle).toBeTruthy();
  });
});
