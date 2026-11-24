import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const t = (locale: 'en' | 'he') =>
  createTranslator({ locale, messages: locale === 'en' ? en : he, namespace: 'ResourceLibrary' });

const KEYS = [
  'secretKeyUnreadable',
  'secretKeyRotatable',
  'secretKeyVaultNotConfigured',
  'heroDescription',
  'kpiCredentials',
  'platformsDescription',
] as const;

describe('Organization resource library speaks plain words about saved passwords', () => {
  it('en avoids decrypt / sealed / vault / rotate / credentials jargon', () => {
    const tr = t('en');
    const text = [...KEYS.map((k) => tr(k)), tr('kpiCredentialsSubtext', { count: 2 })].join(' ');
    expect(text).not.toMatch(/decrypt|sealed|vault|rotate|credential|stored secret|connector/i);
    expect(tr('kpiCredentials')).toBe('Account connections');
  });

  it('every failure line says what to do next', () => {
    const tr = t('en');
    expect(tr('secretKeyUnreadable')).toMatch(/Enter the password or key again/);
    expect(tr('secretKeyRotatable')).toMatch(/Enter it again/);
    expect(tr('secretKeyVaultNotConfigured')).toMatch(/Ask your/);
  });

  it('he has the same keys, without the old technical words', () => {
    const tr = t('he');
    for (const k of KEYS) expect(tr(k)).toBeTruthy();
    const text = KEYS.map((k) => tr(k)).join(' ');
    expect(text).not.toMatch(/לפענח|הוצפן|כספת|מחבר|פרטי התחברות/);
    expect(tr('kpiCredentialsSubtext', { count: 1 })).toContain('סיסמה');
  });
});
