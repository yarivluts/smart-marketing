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

/**
 * The win catalog (KAN-66, E12.2b, plan `04 §6` / `14` gap 14): a fixed set
 * of recognized win "shapes" a rule can be tagged with, on top of KAN-65's
 * otherwise-generic event-pattern engine. `generic` is the default and
 * covers every rule KAN-65 itself could already express (`first_charge`,
 * "order > X"); `reactivation`/`trial_conversion` are the two named types
 * this story adds so a rule author can flag *why* an event counts as a win,
 * and so a future celebration/rendering layer (KAN-67's TV mode: "confetti +
 * sound per win type") has something concrete to key off besides a rule's
 * own free-text name. This module intentionally does not prescribe *which*
 * schema/filters make a rule "a reactivation" — that's still project-
 * specific (every project registers its own event schema names), so the
 * catalog is a label, not a canned rule template.
 */
export const WIN_TYPES = ['generic', 'reactivation', 'trial_conversion'] as const;
export type WinType = (typeof WIN_TYPES)[number];

export function isWinType(value: string): value is WinType {
  return (WIN_TYPES as readonly string[]).includes(value);
}
