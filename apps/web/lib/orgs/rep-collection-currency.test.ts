import { describe, expect, it } from 'vitest';
import { projectLedgerCurrency, signalCurrencyMatchesLedger } from './rep-collection-currency';

describe('projectLedgerCurrency', () => {
  it('normalizes a configured currency to upper-case ISO-4217', () => {
    expect(projectLedgerCurrency('usd')).toBe('USD');
    expect(projectLedgerCurrency('  ils  ')).toBe('ILS');
  });

  /**
   * The important half. An unconfigured project has no currency, and defaulting
   * to one would put a unit on the leaderboard that nothing supports —
   * re-introducing the exact claim this change removes, just with a more
   * confident-looking label (KAN-171).
   */
  it('returns null rather than inventing a default for an unconfigured project', () => {
    expect(projectLedgerCurrency(undefined)).toBeNull();
    expect(projectLedgerCurrency(null)).toBeNull();
    expect(projectLedgerCurrency('')).toBeNull();
    expect(projectLedgerCurrency('   ')).toBeNull();
  });
});

describe('signalCurrencyMatchesLedger', () => {
  /**
   * A signal carries its own currency; the ledger entry it becomes cannot. So a
   * EUR charge added to a USD ledger makes the leaderboard total a sum of two
   * currencies — a number in no unit, used to rank named people.
   */
  it('flags a signal whose currency differs from the project ledger', () => {
    expect(signalCurrencyMatchesLedger('eur', 'USD')).toBe(false);
    expect(signalCurrencyMatchesLedger('JPY', 'USD')).toBe(false);
  });

  it('accepts a matching currency regardless of case or padding', () => {
    expect(signalCurrencyMatchesLedger('usd', 'USD')).toBe(true);
    expect(signalCurrencyMatchesLedger(' USD ', 'USD')).toBe(true);
  });

  /**
   * No baseline means no judgement to make. Warning on every signal when the
   * project has not set a currency would be noise, and noise on a warning
   * teaches people to ignore the warning that matters.
   */
  it('flags nothing when the project has no configured currency', () => {
    expect(signalCurrencyMatchesLedger('eur', null)).toBe(true);
    expect(signalCurrencyMatchesLedger('jpy', null)).toBe(true);
  });
});
