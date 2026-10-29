import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from './en.json';
import he from './he.json';

type Translate = (key: string, values: Record<string, string | number>) => string;
const translator = (locale: 'en' | 'he', messages: unknown): Translate => {
  const t = createTranslator({ locale, messages: messages as never }) as unknown as Translate;
  return (key, values) => t(`AdStudio.${key}`, values);
};

describe('video assemble warning', () => {
  it('en agrees with the number of scenes and says what to do next', () => {
    const t = translator('en', en);
    expect(t('video.assembleFlagged', { scenes: '2', count: 1 })).toContain('in scene 2.');
    const many = t('video.assembleFlagged', { scenes: '1 and 3', count: 2 });
    expect(many).toContain('in scenes 1 and 3.');
    expect(many).toContain('make that part again');
  });
  it('he agrees with the number of scenes', () => {
    const t = translator('he', he);
    expect(t('video.assembleFlagged', { scenes: '2', count: 1 })).toContain('בסצנה 2.');
    expect(t('video.assembleFlagged', { scenes: '1 ו-3', count: 2 })).toContain('בסצנות 1 ו-3.');
  });
});
