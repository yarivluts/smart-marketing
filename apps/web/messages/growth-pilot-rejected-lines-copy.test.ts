import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const places = ['ads', 'landing', 'audience'] as const;

describe('Growth Pilot rejected lines on a target card', () => {
  it.each(places)('%s: English says what happened after a rejection', (place) => {
    const line = en.GrowthPilot[place].status.rejected;
    expect(line).toMatch(/^You rejected .+ - nothing was (published|changed)/);
  });

  it.each(places)('%s: Hebrew has the same two-part line, in Hebrew only', (place) => {
    const line = he.GrowthPilot[place].status.rejected;
    expect(line).toContain(' - ');
    expect(line).not.toMatch(/[A-Za-z]/);
    expect(line.length).toBeGreaterThan(en.GrowthPilot[place].status.rejected.length / 3);
  });

  it('money is only mentioned where ads could have cost something', () => {
    expect(en.GrowthPilot.ads.status.rejected).toContain('no money was spent');
    expect(en.GrowthPilot.audience.status.rejected).toContain('no money was spent');
    expect(en.GrowthPilot.landing.status.rejected).not.toContain('money');
  });
});
