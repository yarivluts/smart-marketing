import { describe, expect, it } from 'vitest';
import { campaignSpendStatusLabelKey } from './campaign-ops-view';

describe('campaignSpendStatusLabelKey', () => {
  it.each([
    ['over_target', 'statusOverTarget'],
    ['on_target', 'statusOnTarget'],
    ['no_target', 'statusNoTarget'],
  ] as const)('maps %s -> %s', (status, expected) => {
    expect(campaignSpendStatusLabelKey(status)).toBe(expected);
  });
});
