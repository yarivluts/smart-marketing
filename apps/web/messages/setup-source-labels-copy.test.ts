import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from './en.json';
import he from './he.json';

/** The setup journey names how data arrives in words a newcomer knows, not "plugin" or "API key". */
describe('setup journey source labels', () => {
  for (const [locale, messages] of [['en', en], ['he', he]] as const) {
    const t = createTranslator({ locale, messages, namespace: 'Onboarding' });
    it(`${locale}: both labels render and avoid the technical terms`, () => {
      const labels = [t('journeySourcePlugin'), t('journeySourcePush')];
      for (const label of labels) {
        expect(label).not.toContain('Onboarding.');
        expect(label).not.toMatch(/plugin|API/i);
      }
      expect(new Set(labels).size).toBe(2);
    });
  }
});
