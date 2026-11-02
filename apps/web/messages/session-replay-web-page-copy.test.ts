import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['intro', 'savedWithoutPlaceholder', 'flowDescription'] as const;
type Section = Record<(typeof KEYS)[number], string>;

describe('session-replay settings speak of the web page', () => {
  const enS = (en as unknown as { SessionReplaySettings: Section }).SessionReplaySettings;
  const heS = (he as unknown as { SessionReplaySettings: Section }).SessionReplaySettings;
  it.each(KEYS)('en %s says web page, not landing page', (k) => {
    expect(enS[k]).toMatch(/web-page/i);
    expect(enS[k]).not.toMatch(/landing[- ]page(?!\})/i);
  });
  it.each(KEYS)('he %s says web page (דף אינטרנט), not דף נחיתה', (k) => {
    expect(heS[k]).toMatch(/(דף|דפי) אינטרנט/);
    expect(heS[k]).not.toMatch(/נחיתה(?!\})/);
  });
});
