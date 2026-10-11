import { describe, expect, it } from 'vitest';
import { formatStripeAmount, formatStripeAmountsByCurrency, recoveryDurationParts } from './billing-recovery-view';

describe('formatStripeAmount', () => {
  it('converts Stripe minor units with the currency’s own divisor and formats with Intl', () => {
    expect(formatStripeAmount(4999, 'usd', 'en')).toBe(new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(49.99));
    expect(formatStripeAmount(500, 'jpy', 'en')).toBe(new Intl.NumberFormat('en', { style: 'currency', currency: 'JPY' }).format(500));
    expect(formatStripeAmount(500, 'isk', 'en')).toBe(new Intl.NumberFormat('en', { style: 'currency', currency: 'ISK' }).format(5));
  });

  it('never hard-codes a dollar sign for non-USD amounts', () => {
    expect(formatStripeAmount(1000, 'eur', 'en')).not.toContain('$');
    expect(formatStripeAmount(1000, 'ils', 'he')).not.toContain('$');
  });

  it('falls back to the number plus code when Intl rejects the currency code', () => {
    expect(formatStripeAmount(1234, 'x1', 'en')).toBe('12.34 X1');
  });
});

describe('formatStripeAmountsByCurrency', () => {
  it('formats each currency on its own and never sums across currencies', () => {
    const line = formatStripeAmountsByCurrency(
      [
        { currency: 'USD', amountMinorUnits: 7500 },
        { currency: 'JPY', amountMinorUnits: 3000 },
      ],
      'en',
    );
    expect(line).toBe(`${formatStripeAmount(7500, 'USD', 'en')} · ${formatStripeAmount(3000, 'JPY', 'en')}`);
  });
});

describe('recoveryDurationParts', () => {
  it('uses hours under two days and days beyond', () => {
    expect(recoveryDurationParts(5)).toEqual({ unit: 'hours', value: 5 });
    expect(recoveryDurationParts(72)).toEqual({ unit: 'days', value: 3 });
  });
});
