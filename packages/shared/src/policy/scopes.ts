/**
 * Levels of the tenancy hierarchy a role binding can be granted at. Ordered
 * broadest-first; a binding at one level inherits downward to every level
 * below it (plan 08 §5.2).
 */
export const SCOPE_LEVELS = ['platform', 'org', 'project', 'environment'] as const;
export type ScopeLevel = (typeof SCOPE_LEVELS)[number];

export function isScopeLevel(value: string): value is ScopeLevel {
  return (SCOPE_LEVELS as readonly string[]).includes(value);
}
