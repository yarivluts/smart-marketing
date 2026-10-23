import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

const JARGON = /exposure|conversion|variant|significan|z-test|experiment_|control\b/i;

describe('A/B tests page: plain words', () => {
  it('en: no statistics or event-name jargon is shown to people', () => {
    const m = (en as unknown as Copy).Experiments;
    const shown = Object.entries(m).filter(([k]) => k !== 'title' && k !== 'metaTitle' && k !== 'eyebrow');
    for (const [key, value] of shown) {
      expect(value.replace(/\{[^}]*\}/g, ''), key).not.toMatch(JARGON);
    }
  });

  it('he: no English event names or test names leak into sentences', () => {
    const m = (he as unknown as Copy).Experiments;
    for (const [key, value] of Object.entries(m)) {
      expect(value, key).not.toMatch(/experiment_|z\b|מבחן z|וריאנט|מובהק|ביקורת/);
    }
  });

  it('the empty state says what to do next', () => {
    expect((en as unknown as Copy).Experiments.resultsEmptyHint).toContain('AI helper');
  });
});
