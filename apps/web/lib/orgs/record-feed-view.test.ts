import { describe, expect, it } from 'vitest';
import type { RawRecordModel, SchemaFieldDef } from '@growthos/firebase-orm-models';
import { RECORD_FEED_IDENTITY_KEYS, recordFeedFilterOptions, toRecordFeedEntryView, type RecordFeedEntryView } from './record-feed-view';

function record(
  overrides: Partial<Omit<RawRecordModel, 'payload'>> & Pick<RawRecordModel, 'id'> & { properties?: Record<string, unknown> },
): RawRecordModel {
  const { properties, ...rest } = overrides;
  return {
    environment_id: 'env-prod',
    client_id: 'client-1',
    landed_at: '2026-08-22T10:00:00.000Z',
    kind: 'event',
    // A real landed `payload` is the whole ingest envelope, not a flat field map — an event's
    // declared fields live under `properties` (see `toRecordFeedEntryView`'s own doc comment).
    payload: { event_id: 'client-1', event: 'some_event', ts: '2026-08-22T10:00:00.000Z', properties: properties ?? {} },
    ...rest,
  } as unknown as RawRecordModel;
}

function fieldDef(overrides: Partial<SchemaFieldDef> & Pick<SchemaFieldDef, 'name'>): SchemaFieldDef {
  return { type: 'string', is_required: true, is_pii: false, is_identity_key: false, ...overrides };
}

describe('toRecordFeedEntryView', () => {
  it('projects declared fields (from the envelope\'s `properties`, not the raw payload top level) in field_defs order, stringifying primitives', () => {
    const view: RecordFeedEntryView = toRecordFeedEntryView(
      record({ id: 'record-1', properties: { plan: 'pro', amount: 5000, is_trial: false } }),
      [fieldDef({ name: 'plan' }), fieldDef({ name: 'amount', type: 'number' }), fieldDef({ name: 'is_trial', type: 'boolean' })],
    );

    expect(view).toEqual({
      id: 'record-1',
      environmentId: 'env-prod',
      clientId: 'client-1',
      landedAt: '2026-08-22T10:00:00.000Z',
      fields: [
        { name: 'plan', value: 'pro', isPii: false },
        { name: 'amount', value: '5000', isPii: false },
        { name: 'is_trial', value: 'false', isPii: false },
      ],
      identity: [],
    });
  });

  it('never reads a PII field into the view — substitutes a fixed redaction placeholder instead', () => {
    const view = toRecordFeedEntryView(record({ id: 'record-1', properties: { email: 'alice@example.com', plan: 'pro' } }), [
      fieldDef({ name: 'email', is_pii: true }),
      fieldDef({ name: 'plan' }),
    ]);

    expect(view.fields[0]).toEqual({ name: 'email', value: '••••••', isPii: true });
    expect(view.fields[1]).toEqual({ name: 'plan', value: 'pro', isPii: false });
  });

  it('renders a missing payload value as an empty string, and stringifies an object/array value as JSON', () => {
    const view = toRecordFeedEntryView(record({ id: 'record-1', properties: { tags: ['a', 'b'] } }), [
      fieldDef({ name: 'missing_field' }),
      fieldDef({ name: 'tags' }),
    ]);

    expect(view.fields[0].value).toBe('');
    expect(view.fields[1].value).toBe('["a","b"]');
  });

  it('renders no fields for a schema with no declared field_defs (e.g. lookup failed)', () => {
    const view = toRecordFeedEntryView(record({ id: 'record-1', properties: { plan: 'pro' } }), []);
    expect(view.fields).toEqual([]);
  });

  describe('identity keys (KAN-210)', () => {
    it('surfaces undeclared anon_id/customer_id from `properties` on the identity line, in a fixed order', () => {
      const view = toRecordFeedEntryView(
        record({ id: 'record-1', properties: { customer_id: 'cust-9', anon_id: 'anon-3', plan: 'pro' } }),
        [fieldDef({ name: 'plan' })],
      );
      expect(view.identity).toEqual([
        { name: 'anon_id', value: 'anon-3', isPii: false },
        { name: 'customer_id', value: 'cust-9', isPii: false },
      ]);
      expect(view.fields).toEqual([{ name: 'plan', value: 'pro', isPii: false }]);
    });

    it('omits an identity key that is absent or empty rather than rendering a blank value', () => {
      const view = toRecordFeedEntryView(record({ id: 'record-1', properties: { anon_id: 'anon-3', customer_id: '' } }), []);
      expect(view.identity).toEqual([{ name: 'anon_id', value: 'anon-3', isPii: false }]);
      expect(toRecordFeedEntryView(record({ id: 'record-2', properties: {} }), []).identity).toEqual([]);
    });

    it('moves a declared identity key onto the identity line instead of rendering it twice', () => {
      const view = toRecordFeedEntryView(record({ id: 'record-1', properties: { customer_id: 'cust-9', plan: 'pro' } }), [
        fieldDef({ name: 'customer_id', is_required: false }),
        fieldDef({ name: 'plan' }),
      ]);
      expect(view.fields.map((field) => field.name)).toEqual(['plan']);
      expect(view.identity).toEqual([{ name: 'customer_id', value: 'cust-9', isPii: false }]);
    });

    it('redacts an identity key the schema explicitly declares is_pii, never reading its value into the view', () => {
      const view = toRecordFeedEntryView(record({ id: 'record-1', properties: { anon_id: 'anon-3', customer_id: 'alice@example.com' } }), [
        fieldDef({ name: 'customer_id', is_pii: true }),
      ]);
      expect(view.identity).toEqual([
        { name: 'anon_id', value: 'anon-3', isPii: false },
        { name: 'customer_id', value: '••••••', isPii: true },
      ]);
      expect(JSON.stringify(view)).not.toContain('alice@example.com');
    });

    it('does not treat anon_id/customer_id as identity keys on a non-event record', () => {
      const entity = {
        id: 'record-1',
        environment_id: 'env-prod',
        client_id: 'acct-1',
        landed_at: '2026-08-22T10:00:00.000Z',
        kind: 'entity',
        payload: { id: 'acct-1', attributes: { customer_id: 'cust-9' } },
      } as unknown as RawRecordModel;
      const view = toRecordFeedEntryView(entity, [fieldDef({ name: 'customer_id' })]);
      expect(view.identity).toEqual([]);
      expect(view.fields).toEqual([{ name: 'customer_id', value: 'cust-9', isPii: false }]);
    });
  });
});

describe('recordFeedFilterOptions', () => {
  it('offers declared non-PII fields plus both identity keys for an event schema', () => {
    expect(RECORD_FEED_IDENTITY_KEYS).toEqual(['anon_id', 'customer_id']);
    expect(recordFeedFilterOptions('event', [fieldDef({ name: 'plan' }), fieldDef({ name: 'email', is_pii: true })])).toEqual({
      declared: ['plan'],
      identity: ['anon_id', 'customer_id'],
    });
  });

  it('lists a declared identity key once, in the identity group', () => {
    expect(recordFeedFilterOptions('event', [fieldDef({ name: 'anon_id' }), fieldDef({ name: 'plan' })])).toEqual({
      declared: ['plan'],
      identity: ['anon_id', 'customer_id'],
    });
  });

  it('never offers an identity key the schema declares is_pii', () => {
    expect(recordFeedFilterOptions('event', [fieldDef({ name: 'customer_id', is_pii: true })])).toEqual({
      declared: [],
      identity: ['anon_id'],
    });
  });

  it('offers no identity keys for a non-event schema', () => {
    expect(recordFeedFilterOptions('entity', [fieldDef({ name: 'customer_id' })])).toEqual({ declared: ['customer_id'], identity: [] });
  });
});
