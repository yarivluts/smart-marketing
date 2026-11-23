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

  it('says "data space" and "ready-made connections" instead of "environments" and "plugin list"', () => {
    for (const text of [en.Onboarding.sourceStepNoEnvironments, en.Onboarding.sourceStepNoManifestsLink]) {
      expect(text).not.toMatch(/environment|plugin/i);
    }
    expect(en.Onboarding.sourceStepNoEnvironments).toMatch(/project settings/i);
    expect(he.Onboarding.sourceStepNoEnvironments).not.toContain('סביבות');
    expect(he.Onboarding.sourceStepNoManifestsLink).not.toContain('תוספים');
  });

  it('gives the "no data space" dead end a button label in both languages', () => {
    expect(en.Onboarding.sourceStepNoEnvironmentsLink).toBe('Open project settings');
    expect(he.Onboarding.sourceStepNoEnvironmentsLink).toMatch(/[\u0590-\u05ff]/);
    expect(en.Onboarding.sourceStepNoEnvironmentsLink).not.toMatch(/environment/i);
  });

  it('explains the "no data space" note in plain words and says the step can be skipped', () => {
    expect(en.Onboarding.sourceStepNoEnvironments).toMatch(/a place that keeps your data/i);
    expect(en.Onboarding.sourceStepNoEnvironments).toMatch(/skip/i);
    expect(he.Onboarding.sourceStepNoEnvironments).toContain('לדלג');
    expect(he.Onboarding.sourceStepNoEnvironments).toContain('מקום ששומר');
  });
});

describe('Onboarding data-step intro', () => {
  it('explains what an access key is and that the step can be skipped', () => {
    expect(en.Onboarding.sourceStepIntro).toMatch(/access key \(a secret code/i);
    expect(en.Onboarding.sourceStepIntro).toMatch(/skip this step/i);
    expect(he.Onboarding.sourceStepIntro).toContain('קוד סודי');
    expect(he.Onboarding.sourceStepIntro).toContain('לדלג');
  });
});
