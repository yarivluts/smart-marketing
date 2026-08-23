import { describe, expect, it } from 'vitest';
import { CANCELLATION_REASON_SCHEMA_FIELDS, CANCELLATION_REASON_SCHEMA_KIND, CANCELLATION_REASON_SCHEMA_NAME } from './cancellation-reason-schema';

describe('cancellation-reason schema', () => {
  it('registers as an event schema named cancellation_reason', () => {
    expect(CANCELLATION_REASON_SCHEMA_KIND).toBe('event');
    expect(CANCELLATION_REASON_SCHEMA_NAME).toBe('cancellation_reason');
  });

  it('requires reason_code but not comment, and flags neither as PII', () => {
    const byName = Object.fromEntries(CANCELLATION_REASON_SCHEMA_FIELDS.map((field) => [field.name, field]));
    expect(byName.reason_code).toMatchObject({ type: 'string', isRequired: true, isPii: false, isIdentityKey: false });
    expect(byName.comment).toMatchObject({ type: 'string', isRequired: false, isPii: false, isIdentityKey: false });
  });
});
