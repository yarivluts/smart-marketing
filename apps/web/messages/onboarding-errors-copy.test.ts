import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Onboarding plain copy', () => {
  it('explains the failure and that earlier steps are kept, not "something went wrong"', () => {
    expect(en.Onboarding.genericError).not.toMatch(/something went wrong/i);
    expect(en.Onboarding.genericError).toMatch(/internet connection/i);
    expect(en.Onboarding.genericError).toMatch(/earlier steps are kept/i);
    expect(he.Onboarding.genericError).toContain('השלבים הקודמים נשמרו');
  });

  it('does not use the words "plugin registry" or "manifest" in the data-source step', () => {
    for (const text of [en.Onboarding.sourceStepPluginHeading, en.Onboarding.sourceStepNoManifests, en.Onboarding.sourceStepNoManifestsLink]) {
      expect(text).not.toMatch(/registry|registered|manifest/i);
    }
  });
});
