import { describe, expect, it } from 'vitest';
import { schemaDefMapKey, type SchemaDefModel, type SchemaFieldDef, type SegmentMemberRow, type SegmentModel } from '@growthos/firebase-orm-models';
import {
  buildSegmentMemberCountView,
  buildSegmentMemberListView,
  toSegmentMemberEntryView,
  toSegmentSummaryView,
  type SegmentSummaryView,
} from './segment-view';

function segment(overrides: Partial<SegmentModel> & Pick<SegmentModel, 'id'>): SegmentModel {
  return {
    name: 'Paying, no demo',
    schema_name: 'customer',
    filters: [{ field: 'plan', op: '=', value: 'pro' }],
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as SegmentModel;
}

describe('toSegmentSummaryView', () => {
  it('projects a SegmentModel onto its list-page card shape', () => {
    const view: SegmentSummaryView = toSegmentSummaryView(
      segment({ id: 'segment-1', owner_person_id: 'person-1', status: 'in_progress', event_conditions: [{ kind: 'no_event', schemaName: 'demo_event' }] }),
    );
    expect(view).toEqual({
      id: 'segment-1',
      name: 'Paying, no demo',
      schemaName: 'customer',
      filterCount: 1,
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      eventConditionCount: 1,
      eventConditions: [{ kind: 'no_event', schemaName: 'demo_event' }],
      createdAt: '2026-08-01T00:00:00.000Z',
      ownerPersonId: 'person-1',
      status: 'in_progress',
    });
  });

  it('defaults owner to null, status to "open", and eventConditions to [] for a segment saved before KAN-81/KAN-93 added those fields', () => {
    const view: SegmentSummaryView = toSegmentSummaryView(segment({ id: 'segment-1' }));
    expect(view.ownerPersonId).toBeNull();
    expect(view.status).toBe('open');
    expect(view.eventConditionCount).toBe(0);
    expect(view.eventConditions).toEqual([]);
  });
});

describe('buildSegmentMemberCountView', () => {
  it('maps a successful outcome to the ok/count shape', () => {
    expect(buildSegmentMemberCountView({ ok: true, count: 42 })).toEqual({ kind: 'ok', count: 42 });
  });

  it('maps each degraded outcome reason to its own render kind', () => {
    expect(buildSegmentMemberCountView({ ok: false, reason: 'warehouse_not_configured', message: 'not configured yet' })).toEqual({
      kind: 'warehouse_not_configured',
    });
    expect(buildSegmentMemberCountView({ ok: false, reason: 'quota_exceeded', message: 'quota is spent' })).toEqual({
      kind: 'quota_exceeded',
    });
    expect(buildSegmentMemberCountView({ ok: false, reason: 'query_error', message: 'table not found' })).toEqual({
      kind: 'query_error',
    });
  });
});

function fieldDef(overrides: Partial<SchemaFieldDef> & Pick<SchemaFieldDef, 'name'>): SchemaFieldDef {
  return { type: 'string', is_required: true, is_pii: false, is_identity_key: false, ...overrides };
}

function memberRow(overrides: Partial<SegmentMemberRow> & Pick<SegmentMemberRow, 'entityId'>): SegmentMemberRow {
  return { properties: {}, lastSeenAt: '2026-08-20T00:00:00.000Z', ...overrides };
}

describe('toSegmentMemberEntryView', () => {
  it('projects declared fields in field_defs order, stringifying primitives', () => {
    const view = toSegmentMemberEntryView(memberRow({ entityId: 'cust_1', properties: { plan: 'pro', amount: 5000, is_trial: false } }), [
      fieldDef({ name: 'plan' }),
      fieldDef({ name: 'amount', type: 'number' }),
      fieldDef({ name: 'is_trial', type: 'boolean' }),
    ]);

    expect(view).toEqual({
      entityId: 'cust_1',
      lastSeenAt: '2026-08-20T00:00:00.000Z',
      fields: [
        { name: 'plan', value: 'pro', isPii: false },
        { name: 'amount', value: '5000', isPii: false },
        { name: 'is_trial', value: 'false', isPii: false },
      ],
    });
  });

  it('never reads a PII field into the view — substitutes a fixed redaction placeholder instead', () => {
    const view = toSegmentMemberEntryView(memberRow({ entityId: 'cust_1', properties: { email: 'alice@example.com', plan: 'pro' } }), [
      fieldDef({ name: 'email', is_pii: true }),
      fieldDef({ name: 'plan' }),
    ]);

    expect(view.fields[0]).toEqual({ name: 'email', value: '••••••', isPii: true });
    expect(view.fields[1]).toEqual({ name: 'plan', value: 'pro', isPii: false });
  });

  it('renders a missing property value as an empty string, and stringifies an object/array value as JSON', () => {
    const view = toSegmentMemberEntryView(memberRow({ entityId: 'cust_1', properties: { tags: ['a', 'b'] } }), [
      fieldDef({ name: 'missing_field' }),
      fieldDef({ name: 'tags' }),
    ]);

    expect(view.fields[0].value).toBe('');
    expect(view.fields[1].value).toBe('["a","b"]');
  });

  it('renders no fields for a schema with no declared field_defs (e.g. lookup failed)', () => {
    const view = toSegmentMemberEntryView(memberRow({ entityId: 'cust_1', properties: { plan: 'pro' } }), []);
    expect(view.fields).toEqual([]);
  });
});

describe('buildSegmentMemberListView', () => {
  function activeSchemaDefsByKindAndName(fieldDefs: readonly SchemaFieldDef[]): ReadonlyMap<string, SchemaDefModel> {
    return new Map([[schemaDefMapKey('entity', 'customer'), { field_defs: fieldDefs } as SchemaDefModel]]);
  }

  it('resolves the segment\'s own entity schema field_defs from the precomputed map (by outcome.schemaName) to redact members', () => {
    const outcome = {
      ok: true as const,
      schemaName: 'customer',
      members: [memberRow({ entityId: 'cust_1', properties: { email: 'alice@example.com', plan: 'pro' } })],
    };

    const view = buildSegmentMemberListView(outcome, activeSchemaDefsByKindAndName([fieldDef({ name: 'email', is_pii: true }), fieldDef({ name: 'plan' })]));

    expect(view).toEqual({
      kind: 'ok',
      entries: [
        {
          entityId: 'cust_1',
          lastSeenAt: '2026-08-20T00:00:00.000Z',
          fields: [
            { name: 'email', value: '••••••', isPii: true },
            { name: 'plan', value: 'pro', isPii: false },
          ],
        },
      ],
    });
  });

  it('renders no fields when the schema lookup misses (never throws)', () => {
    const outcome = { ok: true as const, schemaName: 'customer', members: [memberRow({ entityId: 'cust_1' })] };
    const view = buildSegmentMemberListView(outcome, new Map());
    expect(view).toEqual({ kind: 'ok', entries: [{ entityId: 'cust_1', lastSeenAt: '2026-08-20T00:00:00.000Z', fields: [] }] });
  });

  it('maps each degraded outcome reason to its own render kind, same as buildSegmentMemberCountView', () => {
    expect(buildSegmentMemberListView({ ok: false, reason: 'warehouse_not_configured', message: 'not configured yet' }, new Map())).toEqual({
      kind: 'warehouse_not_configured',
    });
    expect(buildSegmentMemberListView({ ok: false, reason: 'quota_exceeded', message: 'quota is spent' }, new Map())).toEqual({
      kind: 'quota_exceeded',
    });
    expect(buildSegmentMemberListView({ ok: false, reason: 'query_error', message: 'table not found' }, new Map())).toEqual({
      kind: 'query_error',
    });
  });
});
