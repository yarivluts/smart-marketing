import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Pilot = { GrowthPilot: { publish: { countries: string } } };

describe('Growth Pilot publish card: the countries line says what it is for', () => {
  it('en: says where the ads are shown, not just "Countries"', () => {
    const label = (en as unknown as Pilot).GrowthPilot.publish.countries;
    expect(label).toBe('Shown in');
    expect(label).not.toBe('Countries');
  });
  it('he: says where the ads are shown, not just "מדינות"', () => {
    const label = (he as unknown as Pilot).GrowthPilot.publish.countries;
    expect(label).toBe('המודעות יוצגו במדינות');
    expect(label).not.toBe('מדינות');
  });
});
