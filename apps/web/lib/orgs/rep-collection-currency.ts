/**
 * The rep-collection ledger stores `amount` as a bare `number` and carries no
 * currency of its own (`RepCollectionEntryModel`). Everything here exists
 * because of that gap (KAN-171).
 *
 * The leaderboard sums those amounts and ranks reps by the total, and the page
 * rendered the result as an unlabelled number — on the one surface where money
 * is attributed to named people. Meanwhile the "suggested from billing" section
 * directly below it renders `{amount} {currency}` for every Stripe charge, so
 * the page already demonstrates that currencies exist and differ; only the
 * totals pretended otherwise.
 *
 * The project's own configured `currency` (ISO-4217, set on the project
 * settings page) is the best available answer, and it is an assumption rather
 * than a fact about any individual entry — which is exactly why the label says
 * which currency it is, instead of formatting the number as though the system
 * knew.
 */

/** A ledger amount plus the currency it is being presented in, or `null` when the project has not configured one. */
export interface LedgerAmountLabel {
  amount: number;
  /** Upper-case ISO-4217, or `null` when the project has no currency configured — the page then says the amounts are unlabelled rather than guessing a currency. */
  currency: string | null;
}

/** Normalizes a project's configured currency: upper-case ISO-4217, or `null` for unset/blank. Never invents a default — an unconfigured project genuinely does not have one, and picking USD for it would be the fabrication this whole change removes. */
export function projectLedgerCurrency(configured: string | null | undefined): string | null {
  const trimmed = configured?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

/**
 * Whether a billing signal can be added to the ledger without corrupting the
 * totals.
 *
 * A signal carries its own currency; the ledger cannot. So adding a EUR charge
 * to a ledger whose other entries are USD produces a leaderboard total that is
 * the sum of two different currencies — a number in no unit at all, used to
 * rank people. The signal is still shown (it is real, and hiding it would be
 * its own kind of dishonesty), but the page says why adding it is not
 * straightforward rather than letting one click silently mix units.
 *
 * A project with no configured currency cannot make this judgement, so nothing
 * is flagged: there is no baseline to differ from, and warning on every signal
 * would be noise rather than information.
 */
export function signalCurrencyMatchesLedger(signalCurrency: string, projectCurrency: string | null): boolean {
  if (projectCurrency === null) {
    return true;
  }
  return signalCurrency.trim().toUpperCase() === projectCurrency;
}
