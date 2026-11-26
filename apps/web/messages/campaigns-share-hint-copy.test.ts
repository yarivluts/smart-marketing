import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Campaigns share-with-client hint', () => {
  it('uses plain words instead of "creatives" and "client feedback" jargon', () => {
    const text = en.Campaigns.shareWithClientHint;
    expect(text).not.toMatch(/creatives?/i);
    expect(text).toMatch(/link/i);
    expect(text).toMatch(/comments/i);
  });

  it('is present and non-empty in Hebrew', () => {
    expect(he.Campaigns.shareWithClientHint.length).toBeGreaterThan(10);
  });

  it('says the same thing in Hebrew as in English, without "campaigns" or "client" jargon', () => {
    const text = he.Campaigns.shareWithClientHint;
    expect(text).toMatch(/קישור/);
    expect(text).toMatch(/הערות/);
    expect(text).not.toMatch(/קמפיינ/);
    expect(text).not.toMatch(/הכולל/);
  });
});
