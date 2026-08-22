import { describe, expect, it } from 'vitest';
import type { RawRecordModel, SchemaFieldDef } from '@growthos/firebase-orm-models';
import { toRecordFeedEntryView, type RecordFeedEntryView } from './record-feed-view';

function record(overrides: Partial<RawRecordModel> & Pick<RawRecordModel, 'id'>): RawRecordModel {
  return {
    environment_id: 'env-prod',
    client_id: 'client-1',
    landed_at: '2026-08-22T10:00:00.000Z',
    payload: {},
    ...overrides,
  } as RawRecordModel;
}

function fieldDef(overrides: Partial<SchemaFieldDef> & Pick<SchemaFieldDef, 'name'>): SchemaFieldDef {
  return { type: 'string', is_required: true, is_pii: false, is_identity_key: false, ...overrides };
}

describe('toRecordFeedEntryView', () => {
  it('projects declared fields in field_defs order, stringifying primitive payload values', () => {
    const view: RecordFeedEntryView = toRecordFeedEntryView(
      record({ id: 'record-1', payload: { plan: 'pro', amount: 5000, is_trial: false } }),
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
    });
  });

  it('never reads a PII field into the view — substitutes a fixed redaction placeholder instead', () => {
    const view = toRecordFeedEntryView(record({ id: 'record-1', payload: { email: 'alice@example.com', plan: 'pro' } }), [
      fieldDef({ name: 'email', is_pii: true }),
      fieldDef({ name: 'plan' }),
    ]);

    expect(view.fields[0]).toEqual({ name: 'email', value: '••••••', isPii: true });
    expect(view.fields[1]).toEqual({ name: 'plan', value: 'pro', isPii: false });
  });

  it('renders a missing payload value as an empty string, and stringifies an object/array value as JSON', () => {
    const view = toRecordFeedEntryView(record({ id: 'record-1', payload: { tags: ['a', 'b'] } }), [
      fieldDef({ name: 'missing_field' }),
      fieldDef({ name: 'tags' }),
    ]);

    expect(view.fields[0].value).toBe('');
    expect(view.fields[1].value).toBe('["a","b"]');
  });

  it('renders no fields for a schema with no declared field_defs (e.g. lookup failed)', () => {
    const view = toRecordFeedEntryView(record({ id: 'record-1', payload: { plan: 'pro' } }), []);
    expect(view.fields).toEqual([]);
  });
});
