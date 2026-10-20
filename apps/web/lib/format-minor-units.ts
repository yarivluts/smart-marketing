/**
 * Formats an amount that a payment provider reports in a currency's smallest unit (4999 for a
 * $49.99 charge, 500 for a ¥500 one) as money people recognise. The number of decimals comes from
 * the currency itself via `Intl`, so zero-decimal currencies are not divided. An unknown currency
 * code falls back to the plain number followed by the code, never a guessed conversion.
 */
export function formatMinorUnits(amount: number, currency: string, locale: string): string {
  const code = currency.toUpperCase();
  try {
    const probe = new Intl.NumberFormat(locale, { style: 'currency', currency: code });
    const digits = probe.resolvedOptions().maximumFractionDigits ?? 2;
    return probe.format(amount / 10 ** digits);
  } catch {
    return `${new Intl.NumberFormat(locale).format(amount)} ${code}`;
  }
}
