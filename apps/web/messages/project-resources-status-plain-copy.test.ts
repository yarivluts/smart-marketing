import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const t = (locale: 'en' | 'he') =>
  createTranslator({ locale, messages: locale === 'en' ? en : he, namespace: 'ProjectResources' });

describe('Project resources status is a plain phrase, not a stored code', () => {
  it('says approved / waiting for approval in English', () => {
    expect(t('en')('statusLabel', { status: 'approved' })).toBe('Status: Approved');
    expect(t('en')('statusLabel', { status: 'pending' })).toBe('Status: Waiting for approval');
  });

  it('translates the status in Hebrew instead of leaking the English code', () => {
    const approved = t('he')('statusLabel', { status: 'approved' });
    const pending = t('he')('statusLabel', { status: 'pending' });
    expect(approved).not.toMatch(/approved/i);
    expect(pending).not.toMatch(/pending/i);
    expect(pending).not.toBe(approved);
  });
});
