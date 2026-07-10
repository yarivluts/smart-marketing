import { err, ok, type Result } from '../result';
import { extractJsonPathValue } from './json-path';
import type { MappingCastType } from './types';

/** Coerces an extracted JSONPath value into `castType`, the same reject-list posture `FIELD_TYPE_VALIDATORS` (`ingest.service.ts`) takes for schema validation — a value that can't be coerced is a per-field error, not a thrown exception. */
export function castMappingValue(value: unknown, castType: MappingCastType): Result<unknown, string> {
  switch (castType) {
    case 'string': {
      if (value === null || value === undefined) return err('cannot_cast_missing_value');
      if (typeof value === 'string') return ok(value);
      if (typeof value === 'number' || typeof value === 'boolean') return ok(String(value));
      return ok(JSON.stringify(value));
    }
    case 'number': {
      if (typeof value === 'number' && !Number.isNaN(value)) return ok(value);
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) return ok(parsed);
      }
      return err('cannot_cast_to_number');
    }
    case 'boolean': {
      if (typeof value === 'boolean') return ok(value);
      if (value === 'true' || value === 1) return ok(true);
      if (value === 'false' || value === 0) return ok(false);
      return err('cannot_cast_to_boolean');
    }
    case 'timestamp': {
      if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return ok(new Date(value).toISOString());
      if (typeof value === 'number' && !Number.isNaN(value)) {
        // A plausible unix-seconds value is far below a plausible unix-millis
        // value for any date this platform cares about — the same
        // seconds-vs-millis heuristic threshold webhook payloads in the wild
        // (Stripe seconds, many others millis) force a mapping author to
        // resolve one way or the other.
        const millis = Math.abs(value) < 1e12 ? value * 1000 : value;
        const date = new Date(millis);
        if (!Number.isNaN(date.getTime())) return ok(date.toISOString());
      }
      return err('cannot_cast_to_timestamp');
    }
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? ok(value) : err('cannot_cast_to_object');
    case 'array':
      return Array.isArray(value) ? ok(value) : err('cannot_cast_to_array');
  }
}

const TEMPLATE_PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Every `{{json.path}}` placeholder path referenced in a template, in order of appearance — used both to render a template and to validate its placeholders as JSONPaths ahead of save. */
export function templatePlaceholderPaths(template: string): string[] {
  return [...template.matchAll(TEMPLATE_PLACEHOLDER)].map((match) => match[1]);
}

function stringifyPlaceholderValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Renders `template` against `payload`, substituting every `{{json.path}}` placeholder. Fails (rather than silently rendering an empty string) when any placeholder path doesn't resolve, so a template rule surfaces the same "source not found" signal a `rename`/`cast` rule would. */
export function renderTemplate(template: string, payload: unknown): Result<string, string[]> {
  const missing: string[] = [];
  const rendered = template.replace(TEMPLATE_PLACEHOLDER, (_match, rawPath: string) => {
    const extracted = extractJsonPathValue(payload, rawPath);
    if (!extracted.ok) {
      missing.push(rawPath);
      return '';
    }
    return stringifyPlaceholderValue(extracted.value);
  });
  return missing.length > 0 ? err(missing) : ok(rendered);
}
