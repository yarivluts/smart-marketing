import { describe, expect, it } from 'vitest';
import { schemaDefMapKey, type CustomerSearchResult, type SchemaDefModel, type SchemaFieldDef } from '@growthos/firebase-orm-models';
import { buildCustomerSearchView, toCustomerSearchEntryView } from './customer-search-view';

function fieldDef(overrides: Partial<SchemaFieldDef> & Pick<SchemaFieldDef, 'name'>): SchemaFieldDef {
  return { type: 'string', is_required: true, is_pii: false, is_identity_key: false, ...overrides };
}

function searchResult(overrides: Partial<CustomerSearchResult> & Pick<CustomerSearchResult, 'entityId'>): CustomerSearchResult {
  return { schemaName: 'customer', properties: {}, lastSeenAt: '2026-08-20T00:00:00.000Z', ...overrides };
}

describe('toCustomerSearchEntryView', () => {
  it('projects declared fields in field_defs order, stringifying primitives', () => {
    const view = toCustomerSearchEntryView(
      searchResult({ entityId: 'cust_1', properties: { plan: 'pro', amount: 5000, is_trial: false } }),
      [fieldDef({ name: 'plan' }), fieldDef({ name: 'amount', type: 'number' }), fieldDef({ name: 'is_trial', type: 'boolean' })],
    );

    expect(view).toEqual({
      entityId: 'cust_1',
      schemaName: 'customer',
      lastSeenAt: '2026-08-20T00:00:00.000Z',
      fields: [
        { name: 'plan', value: 'pro', isPii: false },
        { name: 'amount', value: '5000', isPii: false },
        { name: 'is_trial', value: 'false', isPii: false },
      ],
    });
  });

  it('never reads a PII field into the view — substitutes a fixed redaction placeholder instead', () => {
    const view = toCustomerSearchEntryView(searchResult({ entityId: 'cust_1', properties: { email: 'alice@example.com', plan: 'pro' } }), [
      fieldDef({ name: 'email', is_pii: true }),
      fieldDef({ name: 'plan' }),
    ]);

    expect(view.fields[0]).toEqual({ name: 'email', value: '••••••', isPii: true });
    expect(view.fields[1]).toEqual({ name: 'plan', value: 'pro', isPii: false });
  });

  it('renders a missing property value as an empty string, and stringifies an object/array value as JSON', () => {
    const view = toCustomerSearchEntryView(searchResult({ entityId: 'cust_1', properties: { tags: ['a', 'b'] } }), [
      fieldDef({ name: 'missing_field' }),
      fieldDef({ name: 'tags' }),
    ]);

    expect(view.fields[0].value).toBe('');
    expect(view.fields[1].value).toBe('["a","b"]');
  });

  it('renders no fields for a schema with no declared field_defs (e.g. lookup failed)', () => {
    const view = toCustomerSearchEntryView(searchResult({ entityId: 'cust_1', properties: { plan: 'pro' } }), []);
    expect(view.fields).toEqual([]);
  });
});

describe('buildCustomerSearchView', () => {
  function activeSchemaDefsByKindAndName(entries: ReadonlyArray<[string, readonly SchemaFieldDef[]]>): ReadonlyMap<string, SchemaDefModel> {
    return new Map(entries.map(([schemaName, fieldDefs]) => [schemaDefMapKey('entity', schemaName), { field_defs: fieldDefs } as SchemaDefModel]));
  }

  it('resolves each result\'s own schema field_defs by its own schemaName — a search can span more than one schema', () => {
    const outcome = {
      ok: true as const,
      results: [
        searchResult({ entityId: 'cust_1', schemaName: 'customer', properties: { email: 'alice@example.com', plan: 'pro' } }),
        searchResult({ entityId: 'lead_1', schemaName: 'lead', properties: { source: 'ads' } }),
      ],
    };

    const view = buildCustomerSearchView(
      outcome,
      activeSchemaDefsByKindAndName([
        ['customer', [fieldDef({ name: 'email', is_pii: true }), fieldDef({ name: 'plan' })]],
        ['lead', [fieldDef({ name: 'source' })]],
      ]),
    );

    expect(view).toEqual({
      kind: 'ok',
      entries: [
        {
          entityId: 'cust_1',
          schemaName: 'customer',
          lastSeenAt: '2026-08-20T00:00:00.000Z',
          fields: [
            { name: 'email', value: '••••••', isPii: true },
            { name: 'plan', value: 'pro', isPii: false },
          ],
        },
        {
          entityId: 'lead_1',
          schemaName: 'lead',
          lastSeenAt: '2026-08-20T00:00:00.000Z',
          fields: [{ name: 'source', value: 'ads', isPii: false }],
        },
      ],
    });
  });

  it('renders no fields when the schema lookup misses (never throws)', () => {
    const outcome = { ok: true as const, results: [searchResult({ entityId: 'cust_1' })] };
    const view = buildCustomerSearchView(outcome, new Map());
    expect(view).toEqual({
      kind: 'ok',
      entries: [{ entityId: 'cust_1', schemaName: 'customer', lastSeenAt: '2026-08-20T00:00:00.000Z', fields: [] }],
    });
  });

  it('maps each degraded outcome reason to its own render kind, same as buildSegmentMemberListView', () => {
    expect(buildCustomerSearchView({ ok: false, reason: 'warehouse_not_configured', message: 'not configured yet' }, new Map())).toEqual({
      kind: 'warehouse_not_configured',
    });
    expect(buildCustomerSearchView({ ok: false, reason: 'quota_exceeded', message: 'quota is spent' }, new Map())).toEqual({
      kind: 'quota_exceeded',
    });
    expect(buildCustomerSearchView({ ok: false, reason: 'query_error', message: 'table not found' }, new Map())).toEqual({
      kind: 'query_error',
    });
  });
});
