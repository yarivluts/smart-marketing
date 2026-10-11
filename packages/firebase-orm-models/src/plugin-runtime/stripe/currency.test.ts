import { describe, expect, it } from 'vitest';
import { stripeCurrencyExponent, stripeMinorUnitsToMajor } from './currency';

describe('stripeCurrencyExponent', () => {
  it('uses two decimals by default', () => {
    expect(stripeCurrencyExponent('usd')).toBe(2);
    expect(stripeCurrencyExponent('EUR')).toBe(2);
  });

  it('knows Stripe zero- and three-decimal currencies', () => {
    expect(stripeCurrencyExponent('jpy')).toBe(0);
    expect(stripeCurrencyExponent('KRW')).toBe(0);
    expect(stripeCurrencyExponent('kwd')).toBe(3);
  });

  it('follows Stripe, not ISO, for ISK and UGX (still two-decimal in the Stripe API)', () => {
    expect(stripeCurrencyExponent('isk')).toBe(2);
    expect(stripeCurrencyExponent('ugx')).toBe(2);
  });
});

describe('stripeMinorUnitsToMajor', () => {
  it('divides by the currency exponent', () => {
    expect(stripeMinorUnitsToMajor(4999, 'usd')).toBe(49.99);
    expect(stripeMinorUnitsToMajor(500, 'jpy')).toBe(500);
    expect(stripeMinorUnitsToMajor(1500, 'kwd')).toBe(1.5);
    expect(stripeMinorUnitsToMajor(500, 'isk')).toBe(5);
  });
});
