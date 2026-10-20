import { describe, expect, it } from 'vitest';
import { formatMinorUnits } from './format-minor-units';

describe('formatMinorUnits', () => {
  it('turns cents into a normal price', () => {
    expect(formatMinorUnits(4999, 'usd', 'en')).toBe('$49.99');
  });

  it('does not divide a zero-decimal currency', () => {
    expect(formatMinorUnits(500, 'JPY', 'en')).toMatch(/500/);
    expect(formatMinorUnits(500, 'JPY', 'en')).not.toMatch(/5\.00/);
  });

  it('uses the currency decimals for three-decimal currencies', () => {
    expect(formatMinorUnits(1500, 'KWD', 'en')).toMatch(/1\.500/);
  });

  it('falls back to the number and code for an invalid currency', () => {
    expect(formatMinorUnits(1234, 'not-a-currency', 'en')).toBe('1,234 NOT-A-CURRENCY');
  });
});
