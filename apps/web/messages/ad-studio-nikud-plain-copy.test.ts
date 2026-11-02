import { describe, expect, it } from 'vitest';
import en from './en.json';

const values = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(values) : [];

describe('the English Ad Studio explains nikud', () => {
  const studio = en.AdStudio;

  it('names the Hebrew vowel marks in the labels a newcomer reads first', () => {
    expect(studio.pronunciation).toMatch(/Hebrew vowel marks/);
    expect(studio.narration.readWithNikud).toMatch(/Hebrew vowel marks/);
    expect(studio.pronunciationAuto).toMatch(/vowel marks \(nikud\)/);
    expect(studio.narration.willVocalize).toMatch(/vowel marks \(nikud\)/);
  });

  it('never leaves bare "nikud" on a button or label', () => {
    expect(studio.nikud.add).toBe('Add vowel marks');
    expect(studio.nikud.adding).toBe('Adding vowel marks…');
    expect(studio.narration.nikudLabel).not.toMatch(/nikud/i);
    expect(studio.narration.savingWithNikud).not.toMatch(/nikud/i);
    expect(values(studio.usageKind).join('\n')).not.toMatch(/nikud/i);
  });
});
