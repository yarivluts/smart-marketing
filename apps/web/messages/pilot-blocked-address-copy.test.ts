import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot refused-address copy', () => {
  it.each([
    ['en', en],
    ['he', he],
  ])('%s asks for a plain address, not one that starts with https://', (_l, m) => {
    const text = (m as { GrowthPilot: { failure: { blocked: string } } }).GrowthPilot.failure.blocked;
    expect(text).not.toContain('https://');
    expect(text).toContain('example.');
  });
});
