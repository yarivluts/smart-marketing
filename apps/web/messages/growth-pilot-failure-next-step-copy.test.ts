import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot failure reasons always tell the person what to do next', () => {
  it('"no image passed" says to ask for a change (en)', () => {
    const reasons = en.GrowthPilot.reasons as Record<string, string>;
    expect(reasons.no_images).toMatch(/ask for a change/);
  });

  it('"no image passed" says to ask for a change (he)', () => {
    const reasons = he.GrowthPilot.reasons as Record<string, string>;
    expect(reasons.no_images).toMatch(/בקשו שינוי/);
  });

  it('every reason has a next step in English', () => {
    const next = /try again|ask for a change|reconnect|connect|check|resets tomorrow|contact|verify|reload/i;
    for (const [code, text] of Object.entries(en.GrowthPilot.reasons as Record<string, string>)) {
      expect(text, code).toMatch(next);
    }
  });
});
