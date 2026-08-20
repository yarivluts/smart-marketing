import { describe, expect, it } from 'vitest';
import { buildMartViewSql, martIntrinsicColumnNames, martIntrinsicColumnTypes, martViewName, MART_KINDS, UnsafeMartIdentifierError } from './schema-mart';
import type { SchemaFieldDef } from '../models/schema-def.model';

const fields: SchemaFieldDef[] = [
  { name: 'platform', type: 'string', is_required: true, is_pii: false, is_identity_key: false },
  { name: 'spend', type: 'number', is_required: true, is_pii: false, is_identity_key: false },
  { name: 'converted', type: 'boolean', is_required: false, is_pii: false, is_identity_key: false },
  { name: 'date', type: 'timestamp', is_required: true, is_pii: false, is_identity_key: false },
  { name: 'meta', type: 'object', is_required: false, is_pii: false, is_identity_key: false },
];

describe('martViewName', () => {
  it('is deterministic and collision-safe across projects sharing a schema name', () => {
    const a = martViewName('org-1', 'proj-1', 'ad_performance_daily');
    const b = martViewName('org-1', 'proj-2', 'ad_performance_daily');
    expect(a).toBe(martViewName('org-1', 'proj-1', 'ad_performance_daily'));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^m_[0-9a-f]{12}_ad_performance_daily$/);
  });

  it('rejects a schema name that would break the compiler identifier rules', () => {
    expect(() => martViewName('org-1', 'proj-1', 'bad-name')).toThrow(UnsafeMartIdentifierError);
  });
});

describe('buildMartViewSql', () => {
  const sql = buildMartViewSql({ organizationId: 'org-1', projectId: 'proj-1', kind: 'measure', schemaName: 'ad_performance_daily', fieldDefs: fields, dataset: 'growthos_core' });

  it('creates-or-replaces the mangled view over stg_raw_records, filtered by kind + schema + tenant', () => {
    expect(sql).toContain(`CREATE OR REPLACE VIEW \`growthos_core.${martViewName('org-1', 'proj-1', 'ad_performance_daily')}\``);
    // Fully qualified source: a stored view's body resolves no defaultDataset
    // at query time — an unqualified ref creates fine but fails every later
    // SELECT (found live by session-B QA, 2026-08-20).
    expect(sql).toContain('FROM `growthos_core.stg_raw_records`');
    expect(sql).toContain("kind = 'measure' AND schema_name = 'ad_performance_daily'");
    expect(sql).toContain("organization_id = 'org-1' AND project_id = 'proj-1'");
  });

  it('keeps the tenant/env/id/time columns so compiler predicates and timeColumn fallbacks keep working', () => {
    for (const column of ['organization_id', 'project_id', 'environment_id', 'client_id', 'landed_at']) {
      expect(sql).toContain(column);
    }
  });

  it('reads each declared field out of the envelope\'s own field sub-object, typed per the schema (JSON_VALUE strings, SAFE_CAST numerics/bools/timestamps, JSON_QUERY objects)', () => {
    // `payload` is the whole ingest ENVELOPE, and a measure's declared fields
    // live under `dimensions` (`checkRecordEnvelope`, docs/api/ingest.md §4).
    // Reading `$.platform` off the top level yields NULL for every record.
    expect(sql).toContain("JSON_VALUE(payload, '$.dimensions.platform') AS `platform`");
    expect(sql).toContain("SAFE_CAST(JSON_VALUE(payload, '$.dimensions.spend') AS FLOAT64) AS `spend`");
    expect(sql).toContain("SAFE_CAST(JSON_VALUE(payload, '$.dimensions.converted') AS BOOL) AS `converted`");
    expect(sql).toContain("SAFE_CAST(JSON_VALUE(payload, '$.dimensions.date') AS TIMESTAMP) AS `date`");
    expect(sql).toContain("JSON_QUERY(payload, '$.dimensions.meta') AS `meta`");
    expect(sql).not.toContain("'$.platform'");
  });

  it('reads an entity schema\'s fields out of `attributes` instead', () => {
    const entitySql = buildMartViewSql({ organizationId: 'org-1', projectId: 'proj-1', kind: 'entity', schemaName: 'customer', fieldDefs: fields, dataset: 'growthos_core' });
    expect(entitySql).toContain("JSON_VALUE(payload, '$.attributes.platform') AS `platform`");
    expect(entitySql).not.toContain('$.dimensions.');
  });

  it('exposes a measure\'s envelope value/ts, which docs tell users not to declare as schema fields', () => {
    expect(sql).toContain("SAFE_CAST(JSON_VALUE(payload, '$.value') AS FLOAT64) AS `value`");
    expect(sql).toContain("SAFE_CAST(JSON_VALUE(payload, '$.ts') AS TIMESTAMP) AS `ts`");
  });

  it('gives an entity mart no value/ts column — those are the measure envelope\'s, and an entity may legitimately declare fields by those names', () => {
    const entitySql = buildMartViewSql({ organizationId: 'org-1', projectId: 'proj-1', kind: 'entity', schemaName: 'customer', fieldDefs: [], dataset: 'growthos_core' });
    expect(entitySql).not.toContain('AS `value`');
    expect(entitySql).not.toContain('AS `ts`');
  });

  it('rejects a field name that could smuggle SQL through the JSON path', () => {
    const evil: SchemaFieldDef[] = [{ name: "x') OR 1=1--", type: 'string', is_required: false, is_pii: false, is_identity_key: false }];
    expect(() => buildMartViewSql({ organizationId: 'org-1', projectId: 'proj-1', kind: 'measure', schemaName: 'ok_name', fieldDefs: evil, dataset: 'growthos_core' })).toThrow(
      UnsafeMartIdentifierError,
    );
  });

});

describe('MART_KINDS / martIntrinsicColumnNames', () => {
  it('only measure/entity schemas get a mart view — the two kinds validateFields in schema-registry.service.ts gates its reserved-name check on', () => {
    expect(MART_KINDS).toEqual(['measure', 'entity']);
  });

  it.each(MART_KINDS)('names exactly the columns buildMartViewSql emits for a %s alongside its declared fields, so a field sharing one of these names would collide', (kind) => {
    const sql = buildMartViewSql({ organizationId: 'org-1', projectId: 'proj-1', kind, schemaName: 'ok_name', fieldDefs: [], dataset: 'growthos_core' });
    const lines = sql.split('\n');
    const selectList = lines.slice(lines.indexOf('SELECT') + 1, lines.findIndex((line) => line.startsWith('FROM ')));
    const emitted = selectList.map((line) => /AS `(\w+)`$|^ {2}(\w+)$/.exec(line.replace(/,$/, ''))).map((match) => match?.[1] ?? match?.[2]);
    expect(emitted).toEqual([...martIntrinsicColumnNames(kind)]);
  });

  it('drops an intrinsic column a legacy schema already declares as a field, rather than emitting the name twice and breaking the whole view', () => {
    const legacy: SchemaFieldDef[] = [{ name: 'value', type: 'string', is_required: true, is_pii: false, is_identity_key: false }];
    const sql = buildMartViewSql({ organizationId: 'org-1', projectId: 'proj-1', kind: 'measure', schemaName: 'legacy_measure', fieldDefs: legacy, dataset: 'growthos_core' });
    expect(sql).toContain("JSON_VALUE(payload, '$.dimensions.value') AS `value`");
    expect(sql).not.toContain("SAFE_CAST(JSON_VALUE(payload, '$.value') AS FLOAT64)");
    expect(sql.match(/AS `value`/g)).toHaveLength(1);
  });

  it('types every intrinsic column it names, so metric-registry validation can check an aggregation against them', () => {
    for (const kind of MART_KINDS) {
      const types = martIntrinsicColumnTypes(kind);
      expect([...types.keys()]).toEqual([...martIntrinsicColumnNames(kind)]);
    }
    expect(martIntrinsicColumnTypes('measure').get('value')).toBe('number');
    expect(martIntrinsicColumnTypes('measure').get('ts')).toBe('timestamp');
    expect(martIntrinsicColumnTypes('entity').has('value')).toBe(false);
  });
});
