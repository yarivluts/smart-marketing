import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio narration hint', () => {
  const enHint = en.AdStudio.pronunciationHint;
  const heHint = he.AdStudio.pronunciationHint;

  it('exists in en and he', () => {
    expect(enHint).toBeTruthy();
    expect(heHint).toBeTruthy();
  });

  it('says what to do without the word "vocalized"', () => {
    expect(enHint).not.toMatch(/vocali[sz]/i);
    expect(enHint).toMatch(/narrator/i);
  });
});
