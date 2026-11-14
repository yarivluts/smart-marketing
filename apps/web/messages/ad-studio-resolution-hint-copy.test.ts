import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = { advanced: { resolutionHint: string } };

describe('Ad Studio resolution hint says sharp or standard in plain words', () => {
  it('en no longer says "assembled" and names both qualities', () => {
    const t = (en.AdStudio as unknown as Studio).advanced.resolutionHint;
    expect(t).not.toMatch(/assembled/i);
    expect(t).toMatch(/sharp/);
    expect(t).toMatch(/standard/);
  });
  it('he is filled in and no longer says "מורכב"', () => {
    const t = (he.AdStudio as unknown as Studio).advanced.resolutionHint;
    expect(t).toBeTruthy();
    expect(t).not.toMatch(/מורכב/);
  });
});
