import { describe, expect, it } from 'vitest';
import { validateAgainstSchema, IMPLICIT_EVENT_ENVELOPE_FIELDS } from './ingest.service';
import type { SchemaFieldDef } from '../models/schema-def.model';

/**
 * Pure-function tests for `validateAgainstSchema` — no emulator needed. The
 * implicit-envelope cases exist because the platform's own tracking snippet
 * (`buildTrackedEvent`) attaches `anon_id`/`customer_id` to every event it
 * fires, so a schema that doesn't declare them must not quarantine the
 * snippet's own traffic (session-B QA, 2026-08-19).
 */

const planOnly: SchemaFieldDef[] = [{ name: 'plan', type: 'string', is_required: true, is_identity_key: false }];

describe('validateAgainstSchema', () => {
  it('quarantines a genuinely unregistered field on an event', () => {
    expect(validateAgainstSchema({ plan: 'pro', tier: 'gold' }, planOnly, 'event')).toEqual(['unregistered_field:tier']);
  });

  it('accepts the snippet-attached identity envelope (anon_id + customer_id) on an event schema that never declared them', () => {
    expect(validateAgainstSchema({ plan: 'pro', anon_id: 'anon-1', customer_id: 'cust-1' }, planOnly, 'event')).toEqual([]);
  });

  it('still type-checks an implicit envelope field — a non-string anon_id is malformed input, not a registration gap', () => {
    expect(validateAgainstSchema({ plan: 'pro', anon_id: 42 }, planOnly, 'event')).toEqual(['field_type_mismatch:anon_id']);
  });

  it('does NOT implicitly allow the envelope fields on entity/measure kinds — only events carry snippet properties', () => {
    expect(validateAgainstSchema({ plan: 'pro', anon_id: 'anon-1' }, planOnly, 'entity')).toEqual(['unregistered_field:anon_id']);
    expect(validateAgainstSchema({ plan: 'pro', anon_id: 'anon-1' }, planOnly)).toEqual(['unregistered_field:anon_id']);
  });

  it('an explicit declaration of an envelope field wins over the implicit rule (its own declared type applies)', () => {
    const declaredAnon: SchemaFieldDef[] = [...planOnly, { name: 'anon_id', type: 'string', is_required: true, is_identity_key: true }];
    expect(validateAgainstSchema({ plan: 'pro' }, declaredAnon, 'event')).toEqual(['missing_required_field:anon_id']);
    expect(validateAgainstSchema({ plan: 'pro', anon_id: 'anon-1' }, declaredAnon, 'event')).toEqual([]);
  });

  it('missing implicit envelope fields are never required', () => {
    expect(validateAgainstSchema({ plan: 'pro' }, planOnly, 'event')).toEqual([]);
  });

  it('the implicit list is exactly the two snippet-attached identity properties', () => {
    expect(IMPLICIT_EVENT_ENVELOPE_FIELDS).toEqual(['anon_id', 'customer_id']);
  });
});
