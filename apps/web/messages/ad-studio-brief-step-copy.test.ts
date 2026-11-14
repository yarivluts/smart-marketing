import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = { stepper: { brief: { description: string } } };

describe('Ad Studio "About the ad" step explains the shape choice in plain words', () => {
  it('en says tall or wide, not "the frame"', () => {
    const text = (en.AdStudio as unknown as Studio).stepper.brief.description;
    expect(text).toMatch(/tall or wide/);
    expect(text).not.toMatch(/\bframe\b/i);
  });

  it('he keeps a description with no unfilled placeholders', () => {
    const text = (he.AdStudio as unknown as Studio).stepper.brief.description;
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/\{/);
  });
});
