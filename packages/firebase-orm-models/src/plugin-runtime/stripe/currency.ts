/**
 * Stripe's own minor-unit exponent per currency (https://docs.stripe.com/currencies): every Stripe
 * `amount` is an integer in the currency's smallest unit, and the divisor depends on the currency.
 *
 * Deliberately Stripe's table, not ICU's (`Intl.NumberFormat#resolvedOptions().maximumFractionDigits`):
 * the two disagree for ISK and UGX, which ISO/ICU treat as zero-decimal but Stripe still represents as
 * two-decimal values "for backwards compatibility" (5 ISK is sent as `500`). Reading ISK through ICU's
 * exponent would display every Icelandic amount 100x too large.
 */
const STRIPE_ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

const STRIPE_THREE_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);

/** How many decimal places a Stripe `amount` in `currency` carries - 0, 2 or 3. Case-insensitive. */
export function stripeCurrencyExponent(currency: string): number {
  const code = currency.trim().toUpperCase();
  if (STRIPE_ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (STRIPE_THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

/** A Stripe minor-unit amount as a decimal value in the currency's major unit (`4999` USD -> `49.99`, `500` JPY -> `500`). */
export function stripeMinorUnitsToMajor(amountMinorUnits: number, currency: string): number {
  return amountMinorUnits / 10 ** stripeCurrencyExponent(currency);
}
