import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot "page has no readable text" failure', () => {
  it('does not mention scripts, which a newcomer cannot act on (en + he)', () => {
    expect(en.GrowthPilot.failure.unreadable).not.toMatch(/script/i);
    expect(he.GrowthPilot.failure.unreadable).not.toMatch(/סקריפט/);
  });

  it('still tells the person which page to try', () => {
    expect(en.GrowthPilot.failure.unreadable).toMatch(/Try the page that lists what you sell/);
    expect(he.GrowthPilot.failure.unreadable.length).toBeGreaterThan(40);
  });
});
