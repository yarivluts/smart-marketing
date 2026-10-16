import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const keys = ['packStepIntro', 'packInstalling', 'sourceStepEventsReceived', 'sourceStepQuarantined'] as const;

describe('onboarding wizard avoids developer words', () => {
  it('has no jargon in English', () => {
    for (const key of keys) {
      expect(en.Onboarding[key]).not.toMatch(/metric pack|ingestion|quarantine|provision|\bpack\b/i);
    }
  });

  it('says in plain words that data is arriving and what happened to unusable records', () => {
    expect(en.Onboarding.sourceStepEventsReceived).toContain('{count}');
    expect(en.Onboarding.sourceStepEventsReceived).toMatch(/arriving/);
    expect(en.Onboarding.sourceStepQuarantined).toMatch(/set aside/);
  });

  it('keeps the same placeholders and no "pack" wording in Hebrew', () => {
    for (const key of keys) {
      expect(he.Onboarding[key]).toMatch(/[֐-׿]/);
      expect(he.Onboarding[key]).not.toMatch(/חבילת|בידוד|הקליטה/);
    }
    expect(he.Onboarding.sourceStepEventsReceived).toContain('{count}');
    expect(he.Onboarding.sourceStepQuarantined).toContain('{count}');
  });
});
