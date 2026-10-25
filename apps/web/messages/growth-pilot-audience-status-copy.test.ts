import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot audience chip, status and activity lines', () => {
  it('say who to reach instead of the marketing word "audience"', () => {
    const lines = (m: typeof en): string[] => [
      m.GrowthPilot.kind.audience,
      ...Object.values(m.GrowthPilot.audience.status),
      m.GrowthPilot.activity.kind.audience_ready,
      m.GrowthPilot.activity.kind.audience_failed,
    ];
    for (const line of lines(en)) expect(line).not.toMatch(/audience/i);
    expect(en.GrowthPilot.kind.audience).toBe('Who to reach');
  });

  it('keeps the Hebrew free of the word for "audience"', () => {
    const he_ = he as unknown as typeof en;
    for (const line of [
      he_.GrowthPilot.kind.audience,
      ...Object.values(he_.GrowthPilot.audience.status),
      he_.GrowthPilot.activity.kind.audience_ready,
      he_.GrowthPilot.activity.kind.audience_failed,
    ]) {
      expect(line).not.toContain('קהל');
    }
  });
});
