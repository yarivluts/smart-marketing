import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const t = (locale: 'en' | 'he', namespace: 'ProjectResources' | 'ResourceLibrary') =>
  createTranslator({ locale, messages: locale === 'en' ? en : he, namespace });

describe('Resources pages say "team members", not "People registry"', () => {
  for (const ns of ['ProjectResources', 'ResourceLibrary'] as const) {
    it(`${ns} uses plain headings in en and he`, () => {
      expect(t('en', ns)('peopleHeading')).toBe('Team members');
      expect(t('he', ns)('peopleHeading')).not.toMatch(/\u05de\u05e8\u05e9\u05dd/);
    });
  }

  it('project hero and empty state avoid "registry", "registered" and "Credentials"', () => {
    for (const locale of ['en', 'he'] as const) {
      const tr = t(locale, 'ProjectResources');
      const text = `${tr('heroDescription')} ${tr('noPeople')} ${tr('peopleHeading')}`;
      expect(text).not.toMatch(/registry|registered|Credentials|\u05de\u05e8\u05e9\u05dd|\u05e0\u05e8\u05e9\u05de\u05d5|\u05e4\u05e8\u05d8\u05d9 \u05d4\u05ea\u05d7\u05d1\u05e8\u05d5\u05ea/);
    }
  });
});
