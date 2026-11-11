import { describe, expect, it } from 'vitest';
import en from './en.json';

describe('Ad Studio pronunciation hint', () => {
  it('tells a newcomer what to fix without the word "vocalized"', () => {
    const hint = en.AdStudio.pronunciationHint;
    expect(hint).not.toMatch(/vocali[sz]ed/i);
    expect(hint).toMatch(/sounds wrong/i);
    expect(hint).toMatch(/vowel marks/i);
  });
});
