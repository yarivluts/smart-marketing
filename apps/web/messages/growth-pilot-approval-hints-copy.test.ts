import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const lines = (m: typeof en): string[] => [
  m.GrowthPilot.waiting.approveHint.target,
  m.GrowthPilot.waiting.approveHint.audience,
  m.GrowthPilot.targets.next,
  m.GrowthPilot.newTarget.hint,
  m.GrowthPilot.audience.revising,
];

describe('Growth Pilot approval hints and progress lines', () => {
  it('say who to reach instead of the marketing word "audience"', () => {
    for (const line of lines(en)) expect(line).not.toMatch(/audience/i);
    expect(en.GrowthPilot.waiting.approveHint.audience).toBe(
      'Approve to show the ads to these people. Nothing is published yet.',
    );
  });

  it('keeps the Hebrew free of the word for "audience"', () => {
    for (const line of lines(he as unknown as typeof en)) expect(line).not.toContain('קהל');
  });
});
