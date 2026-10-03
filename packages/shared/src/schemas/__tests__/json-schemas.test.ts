import { describe, expect, it } from 'vitest';
import {
  CANONICAL_JSON_SCHEMAS,
  getCanonicalJsonSchema,
} from '../json-schemas';
import { CANONICAL_EVENT_TYPES, type CanonicalEventType } from '../types';

describe('Canonical JSON Schemas registry', () => {
  it('contains valid Draft-07 JSON schemas for all 5 canonical event types', () => {
    for (const eventType of CANONICAL_EVENT_TYPES) {
      const schema = getCanonicalJsonSchema(eventType);
      expect(schema).toBeDefined();
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema.type).toBe('object');
      expect(schema.required).toBeDefined();
      expect(Array.isArray(schema.required)).toBe(true);
      expect(schema.properties).toBeDefined();
      expect(typeof schema.properties).toBe('object');
    }
  });

  it('CANONICAL_JSON_SCHEMAS dictionary contains matching keys', () => {
    expect(Object.keys(CANONICAL_JSON_SCHEMAS).sort()).toEqual(
      [...CANONICAL_EVENT_TYPES].sort()
    );
  });

  it('throws an error when querying an unlisted event type', () => {
    expect(() => getCanonicalJsonSchema('unknown_event_type' as CanonicalEventType)).toThrow(
      'No JSON Schema registered'
    );
  });
});
