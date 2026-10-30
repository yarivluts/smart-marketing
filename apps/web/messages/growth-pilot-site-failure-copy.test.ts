import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot "site did not open" failure', () => {
  it('tells the person what to do next (en)', () => {
    expect(en.GrowthPilot.failure.site).toContain('Check the address');
    expect(en.GrowthPilot.failure.site).toContain('another page of your site');
  });

  it('tells the person what to do next (he)', () => {
    expect(he.GrowthPilot.failure.site).toContain('בדקו את הכתובת');
    expect(he.GrowthPilot.failure.site).toContain('דף אחר באתר שלכם');
  });
});
