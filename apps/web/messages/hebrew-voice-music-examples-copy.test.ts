import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio voice and music examples are readable in Hebrew', () => {
  it('keeps the English examples in English', () => {
    expect(en.AdStudio.voice.descriptionPlaceholder).toMatch(/older man/);
    expect(en.AdStudio.advanced.musicDescriptionPlaceholder).toMatch(/guitar/);
  });

  it('shows Hebrew examples, not English sentences, to Hebrew readers', () => {
    for (const text of [
      he.AdStudio.voice.descriptionPlaceholder,
      he.AdStudio.advanced.musicDescriptionPlaceholder,
    ]) {
      expect(text).toMatch(/[א-ת]{3}/);
      expect(text).not.toMatch(/[A-Za-z]{3}/);
    }
  });
});
