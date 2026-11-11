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

describe('Connections: Facebook & Instagram platform name', () => {
  it('is named by the apps people know, without the company name (en + he)', () => {
    expect(en.Connections.platforms.meta_ads.name).toBe('Facebook & Instagram');
    expect(he.Connections.platforms.meta_ads.name).not.toMatch(/Meta/);
    expect(he.Connections.platforms.meta_ads.name.length).toBeGreaterThan(5);
  });
});
