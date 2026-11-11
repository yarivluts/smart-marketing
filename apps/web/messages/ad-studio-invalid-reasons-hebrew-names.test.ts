import { describe, expect, it } from 'vitest';
import he from './he.json';

describe('Hebrew Ad Studio "fix this first" lines name Google and YouTube in Hebrew', () => {
  const keys = [
    'searchOnGoogle',
    'searchLimits',
    'googleVideo',
    'googleHeadline',
    'googleImages',
  ] as const;

  it.each(keys)('%s has no Latin brand names', (key) => {
    expect(he.AdStudio.invalidReason[key]).not.toMatch(/[A-Za-z]/);
  });

  it('agrees with the publish step on the video line', () => {
    expect(he.AdStudio.invalidReason.googleVideo).toContain('בגוגל');
    expect(he.AdStudio.invalidReason.googleVideo).toContain('יוטיוב');
  });
});
