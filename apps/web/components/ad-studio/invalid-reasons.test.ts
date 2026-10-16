import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import he from '../../messages/he.json';
import { describeInvalidReasons } from './invalid-reasons';

const lookup = (messages: typeof en) => (key: string) =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages.AdStudio) as string;

describe('describeInvalidReasons', () => {
  it('turns the server phrases into plain sentences', () => {
    expect(describeInvalidReasons(lookup(en), ['choose at least one country', 'headline is required'])).toBe(
      'Choose at least one country. Add a headline.',
    );
  });

  it('never shows an unknown or raw code', () => {
    const text = describeInvalidReasons(lookup(en), ['headline_too_long']);
    expect(text).toBe(en.AdStudio.invalidReason.other);
    expect(text).not.toContain('headline_too_long');
    expect(describeInvalidReasons(lookup(en), undefined)).toBe(en.AdStudio.invalidReason.other);
  });

  it('has an English and a Hebrew sentence for every known phrase', () => {
    expect(Object.keys(he.AdStudio.invalidReason).sort()).toEqual(Object.keys(en.AdStudio.invalidReason).sort());
    expect(describeInvalidReasons(lookup(he), ['choose at least one keyword'])).toBe(he.AdStudio.invalidReason.keyword);
  });
});
