import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Connections: Facebook & Instagram purpose line', () => {
  it('speaks of Facebook, not "Meta", and of reach in plain words (en)', () => {
    const why = en.Connections.platforms.meta_ads.why;
    expect(why).not.toMatch(/\bMeta\b/);
    expect(why).toMatch(/Facebook/);
  });

  it('has no Latin company name in the Hebrew line', () => {
    const why = he.Connections.platforms.meta_ads.why;
    expect(why).not.toMatch(/Meta/);
    expect(why.length).toBeGreaterThan(20);
  });
});
