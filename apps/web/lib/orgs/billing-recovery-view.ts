import { stripeMinorUnitsToMajor } from '@growthos/firebase-orm-models';

/**
 * A Stripe minor-unit amount formatted as money in its own currency (`4999` USD -> "$49.99",
 * `500` JPY -> "¥500"), via `Intl.NumberFormat` so the symbol and digit grouping follow the reader's
 * locale. The minor-unit divisor is Stripe's (`stripeCurrencyExponent`), not ICU's, because the two
 * disagree for ISK/UGX. A code `Intl` rejects falls back to the plain number plus the code - never a
 * guessed symbol.
 */
export function formatStripeAmount(amountMinorUnits: number, currency: string, locale: string): string {
  const code = currency.trim().toUpperCase();
  const major = stripeMinorUnitsToMajor(amountMinorUnits, code);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(major);
  } catch {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(major)} ${code}`;
  }
}

/** Per-currency amounts as one line, each in its own currency - never summed across currencies. */
export function formatStripeAmountsByCurrency(totals: readonly { currency: string; amountMinorUnits: number }[], locale: string): string {
  return totals.map((total) => formatStripeAmount(total.amountMinorUnits, total.currency, locale)).join(' · ');
}

/** A duration in hours as either hours (under two days) or days, for the "time to recover" figures. */
export function recoveryDurationParts(hours: number): { unit: 'hours' | 'days'; value: number } {
  if (hours < 48) return { unit: 'hours', value: Math.round(hours * 10) / 10 };
  return { unit: 'days', value: Math.round((hours / 24) * 10) / 10 };
}
