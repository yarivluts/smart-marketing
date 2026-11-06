import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = (d: typeof en.AdStudio.demo) => [d.vaultMissing, d.unavailable, d.error.not_set_up, d.failure.browser_unavailable, d.failure.ffmpeg_unavailable, d.recordCost];

describe('Ad Studio product demo: setup problems are in plain words with a next step', () => {
  it('en never mentions servers, encryption keys, AI models or "text calls"', () => {
    for (const text of KEYS(en.AdStudio.demo)) {
      expect(text).not.toMatch(/server|encryption|AI model|text calls|configured/i);
    }
  });

  it('en says it is on our side and to contact support when recording is unavailable', () => {
    const d = en.AdStudio.demo;
    for (const text of [d.vaultMissing, d.unavailable, d.error.not_set_up]) {
      expect(text).toMatch(/our side/i);
      expect(text).toMatch(/support/i);
    }
    expect(d.recordCost).toContain('{calls}');
  });

  it('he does the same (escapes keep Hebrew out of this file)', () => {
    const d = he.AdStudio.demo;
    for (const text of KEYS(d)) {
      expect(text).not.toContain('בשרת'); // "on the server"
      expect(text).not.toContain('מפתח הצפנה'); // "encryption key"
      expect(text).not.toContain('קריאות'); // "calls"
    }
    for (const text of [d.vaultMissing, d.unavailable, d.error.not_set_up]) {
      expect(text).toContain('תמיכה'); // "support"
    }
    expect(d.recordCost).toContain('{calls}');
  });
});
