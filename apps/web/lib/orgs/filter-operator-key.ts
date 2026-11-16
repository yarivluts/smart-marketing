/** Translation key (under `filterOperators`) for each stored filter comparison. */
const KEYS: Record<string, string> = {
  '=': 'eq',
  '!=': 'ne',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
  in: 'in',
};

export function filterOperatorKey(operator: string): string {
  return `filterOperators.${KEYS[operator] ?? 'eq'}`;
}
