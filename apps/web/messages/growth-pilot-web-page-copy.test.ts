import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const pick = (m: typeof en | typeof he) =>
  [m.GrowthPilot.landing.title, ...Object.values(m.GrowthPilot.landing.status), m.GrowthPilot.landing.explain];

describe('Growth Pilot web page card wording', () => {
  it('says "web page", not the marketing term "landing page" (en)', () => {
    for (const text of pick(en)) expect(text).not.toMatch(/landing/i);
    expect(en.GrowthPilot.landing.title).toBe('Web page for {name}');
  });

  it('says "דף אינטרנט", not "דף נחיתה" (he)', () => {
    for (const text of pick(he)) expect(text).not.toContain('נחיתה');
    expect(he.GrowthPilot.landing.title).toContain('דף אינטרנט');
  });
});
