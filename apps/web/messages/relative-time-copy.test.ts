import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from './en.json';
import he from './he.json';

const say = (locale: 'en' | 'he', messages: typeof en, key: string, value: number) =>
  createTranslator({ locale, messages, namespace: 'DashboardPage' } as never)(key as never, { value } as never);

describe('project card "last data received" time', () => {
  it('en: spells the unit out instead of m / h / d', () => {
    expect(say('en', en, 'cardAgo_minutes', 5)).toBe('5 minutes ago');
    expect(say('en', en, 'cardAgo_minutes', 1)).toBe('1 minute ago');
    expect(say('en', en, 'cardAgo_hours', 3)).toBe('3 hours ago');
    expect(say('en', en, 'cardAgo_days', 1)).toBe('1 day ago');
    expect(say('en', en, 'cardAgo_days', 12)).toBe('12 days ago');
  });

  it('he: uses full words and the natural singular and dual forms', () => {
    const out = [
      say('he', he as never, 'cardAgo_minutes', 5),
      say('he', he as never, 'cardAgo_minutes', 1),
      say('he', he as never, 'cardAgo_hours', 2),
      say('he', he as never, 'cardAgo_days', 2),
      say('he', he as never, 'cardAgo_days', 9),
    ];
    for (const s of out) expect(s).not.toMatch(/׳|\{|#/);
    expect(new Set(out).size).toBe(out.length);
    expect(out[4]).toContain('9');
  });
});
