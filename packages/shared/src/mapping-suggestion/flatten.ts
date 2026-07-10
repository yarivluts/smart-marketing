/** One scalar value reachable inside a sample payload, plus the JSONPath that reaches it — the same dotted/bracketed syntax `parseJsonPath` (`mapping-engine/json-path.ts`) accepts, so a suggestion's `sourcePath` is usable as a mapping rule's `sourcePath` unmodified. */
export interface FlattenedSourcePath {
  path: string;
  value: string | number | boolean;
}

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_ARRAY_ITEMS = 3;

/**
 * Walks a parsed sample payload and returns every scalar (string/number/boolean) leaf it can reach,
 * alongside the JSONPath to get there. Only scalars are returned — an object/array can't be the
 * value side of a `rename`/`cast` rule's `sourcePath` today (`applyFieldMapping` extracts a single
 * value per rule), so there is nothing useful to propose for a non-scalar leaf.
 *
 * Bounded by `maxDepth` (object/array nesting) and `maxArrayItems` (elements scanned per array) —
 * the same "don't do unbounded work against caller-supplied data" posture `getEventVolumeOverviewForProject`
 * (KAN-36) and `flattenSamplePayload`'s sibling bounded reads establish — a webhook payload can be
 * arbitrarily deep/wide, and this only needs enough of it to propose a handful of field matches.
 */
export function flattenSamplePayload(
  payload: unknown,
  options?: { maxDepth?: number; maxArrayItems?: number },
): FlattenedSourcePath[] {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxArrayItems = options?.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS;
  const results: FlattenedSourcePath[] = [];

  function walk(value: unknown, path: string, depth: number): void {
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (path.length > 0) {
        results.push({ path, value });
      }
      return;
    }
    if (depth >= maxDepth) {
      return;
    }
    if (Array.isArray(value)) {
      // A bare `[0]` (no preceding key) isn't a valid JSONPath segment per `parseJsonPath` — this
      // only happens for a top-level array payload, which no supported mapping kind's sample looks
      // like anyway (every kind maps one JSON *object* into an envelope), so it's skipped rather
      // than producing a suggestion no rule could ever save.
      if (path.length === 0) {
        return;
      }
      for (let index = 0; index < Math.min(value.length, maxArrayItems); index += 1) {
        walk(value[index], `${path}[${index}]`, depth + 1);
      }
      return;
    }
    if (typeof value === 'object') {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        walk(nested, path.length > 0 ? `${path}.${key}` : key, depth + 1);
      }
    }
  }

  walk(payload, '', 0);
  return results;
}
