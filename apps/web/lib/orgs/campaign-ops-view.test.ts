import { describe, expect, it } from 'vitest';
import {
  campaignSpendStatusLabelKey,
  creativeFatigueLevelLabelKey,
  creativeFatiguePillAccent,
  creativeSwapActionLabelKey,
  creativeSwapActionPillAccent,
} from './campaign-ops-view';

describe('campaignSpendStatusLabelKey', () => {
  it.each([
    ['over_target', 'statusOverTarget'],
    ['on_target', 'statusOnTarget'],
    ['no_target', 'statusNoTarget'],
  ] as const)('maps %s -> %s', (status, expected) => {
    expect(campaignSpendStatusLabelKey(status)).toBe(expected);
  });
});

describe('creativeFatigueLevelLabelKey', () => {
  it.each([
    ['fresh', 'fatigueFresh'],
    ['wearing_out', 'fatigueWearingOut'],
    ['fatigued', 'fatigueFatigued'],
  ] as const)('maps fatigue level %s -> %s', (level, expected) => {
    expect(creativeFatigueLevelLabelKey(level)).toBe(expected);
  });
});

describe('creativeSwapActionLabelKey', () => {
  it.each([
    ['scale', 'actionScale'],
    ['review', 'actionReview'],
    ['auto_swap', 'actionAutoSwap'],
  ] as const)('maps action %s -> %s', (action, expected) => {
    expect(creativeSwapActionLabelKey(action)).toBe(expected);
  });
});

describe('creativeFatiguePillAccent', () => {
  it.each([
    ['fresh', 'mint'],
    ['wearing_out', 'amber'],
    ['fatigued', 'error'],
  ] as const)('maps fatigue level %s -> accent %s', (level, expected) => {
    expect(creativeFatiguePillAccent(level)).toBe(expected);
  });
});

describe('creativeSwapActionPillAccent', () => {
  it.each([
    ['scale', 'sky'],
    ['review', 'amber'],
    ['auto_swap', 'error'],
  ] as const)('maps action %s -> accent %s', (action, expected) => {
    expect(creativeSwapActionPillAccent(action)).toBe(expected);
  });
});

