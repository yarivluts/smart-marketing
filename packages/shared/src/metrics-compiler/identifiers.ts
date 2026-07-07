import { MetricCompilerError } from './types';

/** Table/column/dimension/filter-field names are compiled straight into SQL identifiers — validated defensively here (not just trusted from the registry's own write-time checks) since a hand-built catalog could bypass them. */
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertSafeIdentifier(value: string, kind: string): string {
  if (!SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new MetricCompilerError(`Unsafe ${kind} identifier "${value}" — only letters, digits, and underscores are allowed, and it must start with a letter or underscore.`);
  }
  return value;
}

export function quoteIdentifier(value: string): string {
  return `\`${value}\``;
}
