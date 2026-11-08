/**
 * An amount of the ad account's money, as the person reads it: with the currency when Meta told us
 * which (e.g. "₪45.00" or "$45.00", per the page language), otherwise the bare number - the page
 * then says "in your ad account's currency" next to it.
 */
export function formatBudget(locale: string, amount: number, currency: string | null | undefined): string {
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
    } catch {
      // An ISO-looking code the runtime does not know: fall through to the number.
    }
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
}

/** A suggested new daily budget: half as much again, rounded to a whole amount, at least one more than now. */
export function raisedBudget(current: number): number {
  return Math.max(Math.round(current * 1.5), Math.floor(current) + 1);
}
