import { extractJsonPathValue } from '../mapping-engine';
import type { WinRuleFilter } from './types';

/**
 * Coerces both sides of a comparison to numbers when possible (a win rule's
 * `value` is always a string, since it round-trips through a Firestore
 * document/admin form field) so `"100"` compares numerically against a
 * payload's real `100`. Falls back to string comparison when either side
 * isn't a finite number — the only shape `=`/`!=` can meaningfully test for
 * non-numeric fields; a non-numeric comparison under `>`/`>=`/`<`/`<=`
 * always evaluates to `false` rather than falling back to a lexicographic
 * comparison a human author almost certainly didn't intend.
 */
function compare(actual: unknown, operator: WinRuleFilter['operator'], expected: string): boolean {
  const actualNum = typeof actual === 'number' ? actual : typeof actual === 'string' ? Number(actual) : NaN;
  const expectedNum = Number(expected);
  const bothNumeric = Number.isFinite(actualNum) && Number.isFinite(expectedNum);

  switch (operator) {
    case '=':
      return bothNumeric ? actualNum === expectedNum : String(actual) === expected;
    case '!=':
      return bothNumeric ? actualNum !== expectedNum : String(actual) !== expected;
    case '>':
      return bothNumeric && actualNum > expectedNum;
    case '>=':
      return bothNumeric && actualNum >= expectedNum;
    case '<':
      return bothNumeric && actualNum < expectedNum;
    case '<=':
      return bothNumeric && actualNum <= expectedNum;
    default: {
      const exhaustive: never = operator;
      return exhaustive;
    }
  }
}

/**
 * Whether an event `payload` satisfies every one of a win rule's filters
 * (AND semantics — an empty filter list matches unconditionally, so "any
 * occurrence of this event is a win" is a valid rule, e.g. `first_charge`).
 * A filter whose `field` isn't present in the payload never matches (not an
 * error) — a rule referencing an optional field simply doesn't fire for
 * records that omit it.
 */
export function evaluateWinRuleFilters(payload: unknown, filters: readonly WinRuleFilter[]): boolean {
  return filters.every((filter) => {
    const extracted = extractJsonPathValue(payload, filter.field);
    if (!extracted.ok) {
      return false;
    }
    return compare(extracted.value, filter.operator, filter.value);
  });
}
