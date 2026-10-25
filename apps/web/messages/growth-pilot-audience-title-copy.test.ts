import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot audience card title', () => {
  it('says who will see the ads instead of the marketing word "audience"', () => {
    expect(en.GrowthPilot.audience.title).toBe('Who will see the ads for {name}');
    expect(he.GrowthPilot.audience.title).toBe('מי יראה את המודעות ל{name}');
  });
});
