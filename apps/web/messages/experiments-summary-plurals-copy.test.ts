import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Compare versions: summary line gets numbers right', () => {
  const english = createTranslator({ locale: 'en', messages: en, namespace: 'Experiments' });
  const hebrew = createTranslator({ locale: 'he', messages: he, namespace: 'Experiments' });

  it('en: says "1 version" and "1 person", never "1 versions" or "1 people"', () => {
    const text = english('experimentSummary', { control: 'control', variants: 1, exposures: 1 });
    expect(text).toBe('Original: control · 1 version · 1 person saw it');
  });

  it('en: shows large counts with thousands separators', () => {
    const text = english('experimentSummary', { control: 'control', variants: 3, exposures: 12000 });
    expect(text).toBe('Original: control · 3 versions · 12,000 people saw it');
  });

  it('he: uses the singular forms for one and a grouped number for many', () => {
    const one = hebrew('experimentSummary', { control: 'a', variants: 1, exposures: 1 });
    expect(one).toContain('\u05d2\u05e8\u05e1\u05d4 \u05d0\u05d7\u05ea');
    expect(one).toContain('\u05d0\u05d3\u05dd \u05d0\u05d7\u05d3 \u05e8\u05d0\u05d4');
    const many = hebrew('experimentSummary', { control: 'a', variants: 3, exposures: 12000 });
    expect(many).toContain('3 \u05d2\u05e8\u05e1\u05d0\u05d5\u05ea');
    expect(many).toContain('12,000 \u05d0\u05e0\u05e9\u05d9\u05dd \u05e8\u05d0\u05d5');
  });
});
