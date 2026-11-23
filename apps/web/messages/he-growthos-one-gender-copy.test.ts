import { describe, expect, it } from 'vitest';
import he from './he.json';

// Most of the Hebrew app speaks of GrowthOS in the masculine ("reads", "suggests"). The sign-in pitch and the
// Automation hub used the feminine, so the same product changed gender between screens. Written as escapes:
// Hebrew stays out of code files.
const FEMININE_VERB = /GrowthOS (?:\u05e7\u05d5\u05e8\u05d0\u05ea|\u05de\u05e6\u05d9\u05e2\u05d4|\u05e2\u05d5\u05e7\u05d1\u05ea)(?![\u05d0-\u05ea])|\u05e9-GrowthOS \u05de\u05e6\u05d9\u05e2\u05d4/;

describe('Hebrew copy speaks of GrowthOS in one gender on the first screens', () => {
  it('sign-in pitch and Automation hub use the masculine verbs', () => {
    const texts = [he.Auth.brandDescription, he.Onboarding.introBody];
    const raw = JSON.stringify(he);
    const auto = raw.match(/"(?:hubDescription|navAutomation)":"[^"]*"/g) ?? [];
    expect(auto.length).toBeGreaterThanOrEqual(2);
    for (const t of [...texts, ...auto]) expect(t).not.toMatch(FEMININE_VERB);
    expect(he.Auth.brandDescription).toMatch(/GrowthOS \u05e7\u05d5\u05e8\u05d0 /);
  });
});
