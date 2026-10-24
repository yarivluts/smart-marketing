import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const values = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(values) : [];

describe('the Ad Studio does not call the ad description a "brief"', () => {
  const studio = { en: en.AdStudio, he: he.AdStudio };

  it('names the first step by what it is about', () => {
    expect(studio.en.stage.brief).toBe('About the ad');
    expect(studio.en.stepper.brief.label).toBe('About the ad');
    expect(studio.he.stage.brief).toBe('על המודעה');
    expect(studio.he.stepper.brief.label).toBe('על המודעה');
  });

  it('keeps the agency word out of every Ad Studio sentence', () => {
    expect(values(studio.en).join('\n')).not.toMatch(/\bbrief\b/i);
    expect(values(studio.he).join('\n')).not.toMatch(/בריף/);
  });

  it('keeps the placeholder in the invalid-input message', () => {
    expect(studio.en.errorInvalidBrief).toContain('{reasons}');
    expect(studio.he.errorInvalidBrief).toContain('{reasons}');
  });
});
