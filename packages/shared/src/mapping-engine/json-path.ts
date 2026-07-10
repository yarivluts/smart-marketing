import { err, ok, type Result } from '../result';

export type JsonPathStep = { type: 'key'; key: string } | { type: 'index'; index: number };

/** One dot-separated segment: an identifier, optionally followed by any number of `[<digits>]` array-index suffixes, e.g. `items[0]` or `items[0][1]`. */
const SEGMENT_PATTERN = /^([^.[\]]+)((?:\[\d+\])*)$/;
const INDEX_PATTERN = /\[(\d+)\]/g;

/**
 * Parses a practical JSONPath subset: an optional leading `$` (with or
 * without a following `.`), then dot-separated object-key segments each
 * optionally followed by array-index brackets — e.g. `$.data.object.amount`,
 * `items[0].sku`. Deliberately does not support wildcards, slices, filter
 * expressions, or recursive descent (`..`) — this codebase's mapping use case
 * (one concrete SaaS payload shape -> one concrete schema field) never needs
 * them, and a minimal subset is easier to validate and explain in the admin
 * UI than a general JSONPath grammar.
 */
export function parseJsonPath(path: string): Result<JsonPathStep[], string> {
  const trimmed = path.trim();
  if (trimmed.length === 0) {
    return err('empty_path');
  }
  const withoutRoot = trimmed.startsWith('$') ? trimmed.slice(1).replace(/^\./, '') : trimmed;
  if (withoutRoot.length === 0) {
    return err('empty_path');
  }

  const steps: JsonPathStep[] = [];
  for (const segment of withoutRoot.split('.')) {
    const match = segment.match(SEGMENT_PATTERN);
    if (!match) {
      return err(`invalid_segment:${segment}`);
    }
    steps.push({ type: 'key', key: match[1] });
    for (const indexMatch of match[2].matchAll(INDEX_PATTERN)) {
      steps.push({ type: 'index', index: Number(indexMatch[1]) });
    }
  }
  return ok(steps);
}

/** Walks `payload` along `path`, returning the value found or a reason it wasn't (missing key, out-of-range index, or traversing through a non-object/non-array). Never throws. */
export function extractJsonPathValue(payload: unknown, path: string): Result<unknown, string> {
  const parsed = parseJsonPath(path);
  if (!parsed.ok) {
    return err(parsed.error);
  }

  let current: unknown = payload;
  for (const step of parsed.value) {
    if (step.type === 'key') {
      if (current === null || typeof current !== 'object' || Array.isArray(current)) {
        return err(`not_found:${path}`);
      }
      const record = current as Record<string, unknown>;
      if (!(step.key in record)) {
        return err(`not_found:${path}`);
      }
      current = record[step.key];
    } else {
      if (!Array.isArray(current) || step.index >= current.length) {
        return err(`not_found:${path}`);
      }
      current = current[step.index];
    }
  }
  return ok(current);
}
