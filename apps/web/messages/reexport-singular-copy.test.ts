import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from './en.json';
import he from './he.json';

const tr = (l: 'en' | 'he') => createTranslator({ locale: l, messages: (l === 'en' ? en : he) as never, namespace: 'IngestHealth' });

describe('re-export result line', () => {
  it('says "1 record", not "record(s)"', () => {
    expect(tr('en')('reexportResult', { attempted: 1, exported: 1, failed: 0 })).toBe('1 of 1 record exported, 0 failed');
    expect(tr('en')('reexportResult', { attempted: 5, exported: 4, failed: 1 })).toBe('4 of 5 records exported, 1 failed');
    expect(en.IngestHealth.reexportResult).not.toMatch(/\(s\)/);
  });
  it('has a Hebrew singular', () => {
    expect(tr('he')('reexportResult', { attempted: 1, exported: 1, failed: 0 })).toContain('רשומה אחת');
    expect(tr('he')('reexportResult', { attempted: 5, exported: 5, failed: 0 })).toContain('5 רשומות');
  });
});
