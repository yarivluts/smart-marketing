/**
 * Types for the win-rules engine (KAN-65, plan `04 §6` / `13 §E12.2`): pure,
 * Firestore-free — evaluates an already-landed event payload against a
 * rule's own filter conditions. Kept independent of any specific ORM model
 * type, the same "compiler stays pure, the model layer resolves real data
 * into it" split `metrics-compiler` and `mapping-engine` already establish.
 */

/**
 * Deliberately a strict subset of `MetricFilterOperator`
 * (`metrics-compiler/types.ts`) — a win rule filters one already-landed
 * event's own payload fields (e.g. "amount > 100"), not a warehouse column
 * against a comma-separated value list, so `in` has no useful meaning here.
 */
export const WIN_RULE_FILTER_OPERATORS = ['=', '!=', '>', '>=', '<', '<='] as const;
export type WinRuleFilterOperator = (typeof WIN_RULE_FILTER_OPERATORS)[number];

export function isWinRuleFilterOperator(value: string): value is WinRuleFilterOperator {
  return (WIN_RULE_FILTER_OPERATORS as readonly string[]).includes(value);
}

/**
 * One filter clause evaluated against an event payload. `field` is a
 * `mapping-engine` JSON path (e.g. `amount` or `data.object.amount`) rooted
 * at the payload itself. Every filter on a rule must match (AND) for the
 * rule to fire — see `evaluateWinRuleFilters`.
 */
export interface WinRuleFilter {
  field: string;
  operator: WinRuleFilterOperator;
  value: string;
}
