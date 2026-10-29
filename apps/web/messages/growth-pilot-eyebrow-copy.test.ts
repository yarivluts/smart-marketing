import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot start screen tag', () => {
  it('says in plain words what Growth Pilot is (en)', () => {
    expect(en.GrowthPilot.start.eyebrow).toBe('Growth Pilot - your AI marketer');
  });

  it('says in plain words what the pilot is (he)', () => {
    expect(he.GrowthPilot.start.eyebrow).toContain(he.GrowthPilot.title);
    expect(he.GrowthPilot.start.eyebrow).toContain('משווק');
  });
});
